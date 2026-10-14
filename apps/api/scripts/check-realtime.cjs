const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const noop = () => () => {};
class WsException extends Error {}
const moduleUnderTest = { exports: {} };
const filename = path.resolve(__dirname, '../src/realtime/realtime.gateway.ts');
const mocks = {
  '@nestjs/common': { Logger: class { warn() {} } },
  '@nestjs/websockets': { ConnectedSocket: noop, MessageBody: noop, SubscribeMessage: noop, WebSocketGateway: noop, WebSocketServer: noop, WsException },
  '@nestjs/jwt': { JwtService: class {} },
  '../prisma/prisma.service': { PrismaService: class {} },
  '../common/mappers': { toOrderDto: (order) => order },
  '../common/db-includes': { orderInclude: {} },
  '../common/geo': { haversineKm: () => 1 },
  '../common/mitra-eligibility': { findEligibleMitraIds: async () => new Set(['m']) },
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true } }).outputText, { module: moduleUnderTest, exports: moduleUnderTest.exports, require: (name) => mocks[name] ?? {}, console });
const { RealtimeGateway } = moduleUnderTest.exports;
const profile = { id: 'm', status: 'OFFLINE', verification: 'VERIFIED' };
const updates = [];
const prisma = {
  user: { findUnique: async () => ({ id: 'u', role: 'MITRA', mitraProfile: profile }) },
  mitraProfile: {
    findUnique: async () => ({ ...profile }),
    updateMany: async ({ where, data }) => {
      updates.push({ where, data });
      if (where.status?.not === profile.status || (typeof where.status === 'string' && where.status !== profile.status)) return { count: 0 };
      Object.assign(profile, data); return { count: 1 };
    },
    update: async ({ data }) => { updates.push(data); Object.assign(profile, data); },
  },
  order: { findUnique: async () => ({ customerId: 'owner', mitraId: 'other', status: 'MATCHED' }) },
};
function socket() {
  return { data: {}, handshake: { headers: {}, auth: { token: 'test' } }, rooms: [], events: [], join(room) { this.rooms.push(room); }, leave(room) { this.rooms = this.rooms.filter((r) => r !== room); }, emit(name, data) { this.events.push({ name, data }); }, disconnect() { this.disconnected = true; } };
}
(async () => {
  let tokenType = 'access';
  const gateway = new RealtimeGateway({ verifyAsync: async () => ({ sub: 'u', type: tokenType }) }, prisma);
  const client = socket();
  gateway.server = { in: () => ({ fetchSockets: async () => [] }), to() { return this; }, emit() {} };
  await gateway.handleConnection(client);
  assert.deepEqual(client.rooms, ['user:u'], 'handshake must not auto-subscribe mitra');
  for (const lat of [NaN, Infinity, 91]) await assert.rejects(gateway.onListenOrders(client, { lat, lng: 1 }), /tidak valid/);
  profile.verification = 'PENDING';
  await assert.rejects(gateway.onListenOrders(client, { lat: 1, lng: 1 }), /terverifikasi/);
  profile.verification = 'VERIFIED'; profile.status = 'ON_DUTY';
  await gateway.onListenOrders(client, { lat: 1, lng: 1 });
  assert.equal(profile.status, 'ON_DUTY');
  await assert.rejects(gateway.onStopOrders(client), /order aktif/);
  await gateway.handleDisconnect(client);
  assert.equal(profile.status, 'ON_DUTY', 'disconnect must preserve assignment');
  await assert.rejects(gateway.onJoinOrder(client, { orderId: 'foreign' }), /Tidak berhak/);
  const count = updates.length;
  await assert.rejects(gateway.onMitraLocation(client, { lat: 1, lng: 1, orderId: 'foreign' }), /bukan milik/);
  assert.equal(updates.length, count, 'denied order location must not mutate profile');
  await assert.rejects(gateway.onMitraLocation(client, { lat: 1, lng: 1, heading: NaN }), /heading/);
  profile.status = 'OFFLINE';
  await assert.rejects(gateway.onMitraLocation(client, { lat: 1, lng: 1 }), /tidak aktif/);
  for (tokenType of ['refresh', undefined]) {
    const rejected = socket(); await gateway.handleConnection(rejected); assert.equal(rejected.disconnected, true);
  }
  console.log('realtime authorization regression passed');
})().catch((err) => { console.error(err); process.exitCode = 1; });
