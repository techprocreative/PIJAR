import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { ServerEvent } from '@pijar/shared';
import { toOrderDto } from '../common/mappers';
import { orderInclude } from '../common/db-includes';
import { haversineKm } from '../common/geo';
import { findEligibleMitraIds } from '../common/mitra-eligibility';

// Payload identitas hasil verifikasi handshake JWT
export interface WsUser {
  userId: string;
  role: 'CUSTOMER' | 'MITRA' | 'ADMIN';
  mitraId?: string; // terisi untuk role MITRA
}

// Bentuk socket.data setelah handshake (Socket.IO menyimpan data sebagai any)
interface SocketUserData {
  user?: WsUser;
  listenCenter?: { lat: number; lng: number };
  initPromise?: Promise<void>;
}

/**
 * REALTIME GATEWAY — Socket.IO
 *
 * Handshake: koneksi WS wajib membawa access token JWT.
 *   const io = io(backendUrl, { auth: { token: accessToken } })
 *
 * Room:
 *   `order:{orderId}`   → customer + mitra matched + admin (bidding & tracking)
 *   `mitra:orders`      → semua mitra online (broadcast order baru + status broadcast)
 *   `admin`             → dashboard
 *
 * Event server→client lihat ServerEvent (@pijar/shared).
 * Event client→server:
 *   - mitra:listen_orders  { lat, lng }  → join room broadcast + set titik filter
 *   - order:join           { orderId }   → join room order (otorisasi di dalam)
 */
@WebSocketGateway({
  namespace: 'ws',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /** Server Socket.IO — di-inject oleh @WebSocketServer setelah init. */
  @WebSocketServer()
  server!: Server;

  // ===== Handshake & disconnect =====

  async handleConnection(client: Socket): Promise<void> {
    // Simpan promise inisialisasi supaya handler pesan yang datang lebih cepat
    // dari selesainya handshake async (race Socket.IO buffered events) bisa menunggu.
    const data = client.data as SocketUserData;
    data.initPromise = this.initConnection(client);
    await data.initPromise;
  }

  private async initConnection(client: Socket): Promise<void> {
    try {
      const authHeader = client.handshake.headers?.authorization;
      const bearer = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '') : '';
      const token = client.handshake.auth?.token || bearer;

      const payload = await this.jwt.verifyAsync<{ sub: string; type?: string }>(token);
      if (payload.type !== 'access' || typeof payload.sub !== 'string') throw new Error('token salah jenis');

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { mitraProfile: true },
      });
      if (!user) throw new Error('user tidak ditemukan');

      const wsUser: WsUser = {
        userId: user.id,
        role: user.role,
        ...(user.mitraProfile ? { mitraId: user.mitraProfile.id } : {}),
      };
      client.data.user = wsUser;
      await client.join(`user:${user.id}`);
      if (user.role === 'ADMIN') await client.join('admin');
    } catch (err) {
      this.logger.warn(`WS ditolak: ${err instanceof Error ? err.message : err}`);
      client.emit('exception', { status: 'error', message: 'Sesi tidak valid' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const user = getSocketUser(client);
    if (user?.mitraId) {
      // tandai mitra OFFLINE bila tidak ada socket lain untuk mitra tsb
      const stillConnected = await this.server
        .in(`user:${user.userId}`)
        .fetchSockets()
        .then((sockets) =>
          sockets.some((s) => getSocketUser(s)?.mitraId === user.mitraId),
        )
      if (!stillConnected) {
        await this.prisma.mitraProfile.updateMany({
          where: { id: user.mitraId, status: 'ONLINE' },
          data: { status: 'OFFLINE', lastSeenAt: new Date() },
        });
      }
    }
  }

  // ===== Client → server =====

  /** Mitra bergabung ke room broadcast order baru + mengirim titik filter radius. */
  @SubscribeMessage('mitra:listen_orders')
  async onListenOrders(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { lat: number; lng: number },
  ): Promise<{ ok: true }> {
    const user = await this.requireWsUser(client);
    if (user.role !== 'MITRA' || !user.mitraId) {
      throw new WsException('Hanya mitra yang bisa listen orders');
    }
    this.validateLocation(body);
    const profile = await this.prisma.mitraProfile.findUnique({ where: { id: user.mitraId } });
    if (!profile || profile.verification !== 'VERIFIED') throw new WsException('Mitra belum terverifikasi');
    await this.prisma.mitraProfile.updateMany({
      where: { id: user.mitraId, verification: 'VERIFIED', status: { not: 'ON_DUTY' } },
      data: { status: 'ONLINE', lastLat: body.lat, lastLng: body.lng, lastSeenAt: new Date() },
    });
    client.data.listenCenter = { lat: body.lat, lng: body.lng };
    if (profile.status !== 'ON_DUTY') await client.join('mitra:orders');
    return { ok: true };
  }

  @SubscribeMessage('mitra:stop_orders')
  async onStopOrders(@ConnectedSocket() client: Socket): Promise<{ ok: true }> {
    const user = await this.requireWsUser(client);
    if (user.role !== 'MITRA' || !user.mitraId) throw new WsException('Hanya mitra');
    const updated = await this.prisma.mitraProfile.updateMany({
      where: { id: user.mitraId, status: { not: 'ON_DUTY' } },
      data: { status: 'OFFLINE', lastSeenAt: new Date() },
    });
    if (!updated.count) throw new WsException('Selesaikan order aktif sebelum offline');
    const sockets = await this.server.in(`user:${user.userId}`).fetchSockets();
    for (const socket of sockets) {
      await socket.leave('mitra:orders');
      delete socket.data.listenCenter;
    }
    this.emitToUser(user.userId, { event: 'mitra:status', data: { mitraId: user.mitraId, status: 'OFFLINE' } });
    return { ok: true };
  }

  /**
   * Push lokasi mitra (dipakai juga background task di app mitra).
   * Saat membawa orderId → relay ke room `order:{orderId}` sebagai tracking:location.
   */
  @SubscribeMessage('mitra:location')
  async onMitraLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { lat: number; lng: number; heading?: number; accuracyM?: number; orderId?: string },
  ): Promise<{ ok: true }> {
    const user = await this.requireWsUser(client);
    if (user.role !== 'MITRA' || !user.mitraId) {
      throw new WsException('Hanya mitra yang bisa mengirim lokasi');
    }
    this.validateLocation(body);
    if (body.heading != null && (!Number.isFinite(body.heading) || body.heading < 0 || body.heading >= 360)) {
      throw new WsException('heading tidak valid');
    }
    if (body.accuracyM != null && (!Number.isFinite(body.accuracyM) || body.accuracyM < 0)) {
      throw new WsException('accuracyM tidak valid');
    }
    if (body.orderId != null && (typeof body.orderId !== 'string' || !body.orderId)) throw new WsException('orderId tidak valid');
    const profile = await this.prisma.mitraProfile.findUnique({ where: { id: user.mitraId } });
    if (!profile || profile.verification !== 'VERIFIED' || profile.status === 'OFFLINE') {
      throw new WsException('Mitra tidak aktif atau belum terverifikasi');
    }
    if (body.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: body.orderId },
        select: { mitraId: true, status: true },
      });
      if (order?.mitraId !== user.mitraId || !['MATCHED', 'MITRA_ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS'].includes(order.status)) {
        throw new WsException('Order bukan milik mitra ini');
      }
      const evt = {
        event: 'tracking:location',
        data: {
          orderId: body.orderId,
          mitraId: user.mitraId,
          location: { lat: body.lat, lng: body.lng },
          ...(body.heading != null ? { heading: body.heading } : {}),
          at: new Date().toISOString(),
        },
      } satisfies ServerEvent;
      this.server.to(`order:${body.orderId}`).emit('tracking:location', evt);
    }
    await this.prisma.mitraProfile.update({
      where: { id: user.mitraId },
      data: { lastLat: body.lat, lastLng: body.lng, lastSeenAt: new Date() },
    });
    client.data.listenCenter = { lat: body.lat, lng: body.lng };
    return { ok: true };
  }

  /** Join room order (customer pemilik, mitra matched, atau admin). */
  @SubscribeMessage('order:join')
  async onJoinOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId: string },
  ): Promise<{ ok: true }> {
    const user = await this.requireWsUser(client);
    if (typeof body?.orderId !== 'string' || !body.orderId) throw new WsException('orderId wajib');

    const order = await this.prisma.order.findUnique({
      where: { id: body.orderId },
      select: { customerId: true, mitraId: true },
    });
    if (!order) throw new WsException('Order tidak ditemukan');

    const allowed =
      user.role === 'ADMIN' ||
      (user.role === 'CUSTOMER' && order.customerId === user.userId) ||
      (user.role === 'MITRA' && order.mitraId != null && order.mitraId === user.mitraId);
    if (!allowed) throw new WsException('Tidak berhak join order ini');

    await client.join(`order:${body.orderId}`);
    return { ok: true };
  }

  // ===== Dipanggil service lain (REST controller) =====

  /**
   * Broadcast order baru ke mitra dalam radius bertingkat 3→5→10 km
   * (ARCHITECTURE.md: radius diperluas bila lingkup dalam kosong).
   * Admin room selalu menerima salinan untuk monitoring.
   */
  async broadcastNewOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: orderInclude,
    });
    const dto = toOrderDto(order);
    const event: ServerEvent = { event: 'order:new', data: dto };

    const sockets = await this.server.in('mitra:orders').fetchSockets();
    const eligible = await findEligibleMitraIds(this.prisma, order);
    const mitrasWithin = (radiusKm: number) =>
      sockets.filter((socket) => {
        const mitraId = getSocketUser(socket)?.mitraId;
        if (!mitraId || !eligible.has(mitraId)) return false;
        const center = getListenCenter(socket.data);
        if (!center) return false;
        return haversineKm(center, dto.address.location) <= radiusKm;
      });

    // Radius bertingkat: coba 3 km → 5 km → 10 km, berhenti di lingkup pertama yang berisi mitra
    for (const radiusKm of [3, 5, 10]) {
      const targets = mitrasWithin(radiusKm);
      if (targets.length === 0) continue;
      for (const socket of targets) socket.emit('order:new', event);
      break;
    }

    this.server.to('admin').emit('order:new', event);
  }

  /** Emit ke room order + admin. */
  emitToOrder(orderId: string, event: ServerEvent): void {
    this.server.to(`order:${orderId}`).to('admin').emit(event.event, event);
  }

  emitToAdmin(event: ServerEvent): void {
    this.server.to('admin').emit(event.event, event);
  }

  emitToUser(userId: string, event: ServerEvent): void {
    this.server.to(`user:${userId}`).emit(event.event, event);
  }

  emitToMitraBroadcast(event: ServerEvent): void {
    this.server.to('mitra:orders').emit(event.event, event);
  }

  private validateLocation(body: { lat: number; lng: number }): void {
    if (!body || !Number.isFinite(body.lat) || !Number.isFinite(body.lng) || Math.abs(body.lat) > 90 || Math.abs(body.lng) > 180) {
      throw new WsException('lat/lng tidak valid');
    }
  }

  /** Otorisasi: tunggu handshake selesai lalu pastikan user terverifikasi. */
  private async requireWsUser(client: Socket): Promise<WsUser> {
    const data = client.data as SocketUserData;
    if (data.initPromise) await data.initPromise;
    const user = getSocketUser(client);
    if (!user) throw new WsException('Socket belum terautentikasi');
    return user;
  }
}

/** Type guard: baca identitas user dari socket.data tanpa unchecked cast. */
function getSocketUser(socket: { data: unknown }): WsUser | undefined {
  const data = socket.data;
  if (data && typeof data === 'object' && 'user' in data) {
    const user = (data as Record<string, unknown>).user;
    if (user && typeof user === 'object' && 'userId' in user && 'role' in user) {
      return user as WsUser;
    }
  }
  return undefined;
}

/** Type guard: baca titik listen_center mitra dari socket.data (unknown). */
function getListenCenter(data: unknown): { lat: number; lng: number } | undefined {
  if (data && typeof data === 'object' && 'listenCenter' in data) {
    const c = (data as Record<string, unknown>).listenCenter;
    if (c && typeof c === 'object' && 'lat' in c && 'lng' in c) {
      const { lat, lng } = c as { lat: unknown; lng: unknown };
      if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
    }
  }
  return undefined;
}
