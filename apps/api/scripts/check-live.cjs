const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { JwtService } = require('@nestjs/jwt');
const { io } = require('../../customer/node_modules/socket.io-client');
const p = new PrismaClient();
const API = process.env.API || 'http://localhost:3011';
const sockets = [];
const users = [];
const ids = [];
let service;
async function request(method, path, token, body) {
  const response = await fetch(`${API}/v1${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: await response.json() };
}
function event(socket, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, done); reject(new Error(`No ${name}`)); }, 8000);
    function done(data) { clearTimeout(timer); resolve(data); }
    socket.once(name, done);
  });
}
async function connect(token) {
  const socket = io(`${API}/ws`, { auth: { token }, transports: ['websocket'], autoConnect: false, reconnection: false });
  sockets.push(socket);
  const connected = event(socket, 'connect'); socket.connect(); await connected;
  return socket;
}
async function main() {
  const prefix = `live-${Date.now()}`;
  try {
    service = await p.service.create({ data: { name: prefix, description: prefix, durationMinutes: 60, basePrice: 100000 } });
    for (let i = 0; i < 4; i++) {
      users.push(await p.user.create({ data: {
        phone: `${prefix}-${i}`, name: prefix, role: i === 1 || i === 3 ? 'MITRA' : 'CUSTOMER', walletBalance: 500000,
        ...(i === 1 || i === 3 ? { mitraProfile: { create: { gender: 'MALE', verification: i === 1 ? 'VERIFIED' : 'PENDING', status: 'OFFLINE', lastLat: -6.2, lastLng: 106.8, services: { create: { serviceId: service.id } } } } } : {}),
      } }));
    }
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const tokens = users.map(u => jwt.sign({ sub: u.id, type: 'access' }, { expiresIn: '15m' }));
    assert.equal((await request('GET', '/wallet')).status, 401);
    const missingType = jwt.sign({ sub: users[0].id });
    assert.equal((await request('GET', '/wallet', missingType)).status, 401);
    const customer = await connect(tokens[0]);
    const mitra = await connect(tokens[1]);
    const outsider = await connect(tokens[2]);
    const unverified = await connect(tokens[3]);
    const denied = event(unverified, 'exception');
    unverified.emit('mitra:listen_orders', { lat: -6.2, lng: 106.8 });
    assert.match((await denied).message, /terverifikasi/);
    assert.deepEqual(await mitra.timeout(5000).emitWithAck('mitra:listen_orders', { lat: -6.2, lng: 106.8 }), { ok: true });
    const incoming = event(mitra, 'order:new');
    const created = await request('POST', '/orders', tokens[0], { serviceId: service.id, addressLabel: 'Rumah', addressDetail: 'Alamat isolated smoke', location: { lat: -6.2, lng: 106.8 }, customerPrice: 100000 });
    assert.equal(created.status, 201); ids.push(created.body.id);
    assert.equal((await incoming).data.id, created.body.id);
    const id = created.body.id;
    await customer.timeout(5000).emitWithAck('order:join', { orderId: id });
    const unauthorized = event(outsider, 'exception');
    outsider.emit('order:join', { orderId: id });
    assert.match((await unauthorized).message, /Tidak berhak/);
    const bidEvent = event(customer, 'order:bid');
    const bid = await request('POST', `/orders/${id}/bids`, tokens[1], { price: 100000, etaMinutes: 10 });
    assert.equal(bid.status, 201); assert.equal((await bidEvent).data.id, bid.body.id);
    const matched = event(mitra, 'order:matched');
    const accepted = await request('POST', `/orders/${id}/accept-bid`, tokens[0], { bidId: bid.body.id });
    assert.equal(accepted.body.status, 'MATCHED'); assert.equal((await matched).data.id, id);
    assert.equal((await request('GET', `/orders/${id}`, tokens[1])).body.status, 'MATCHED');
    assert.equal((await request('GET', '/orders/mine', tokens[1])).body[0].id, id);
    assert.equal((await request('GET', `/orders/${id}`, tokens[2])).status, 403);
    const tracking = event(customer, 'tracking:location');
    await mitra.timeout(5000).emitWithAck('mitra:location', { lat: -6.201, lng: 106.801, orderId: id });
    assert.equal((await tracking).data.orderId, id);
    await mitra.timeout(5000).emitWithAck('mitra:listen_orders', { lat: -6.2, lng: 106.8 });
    assert.equal((await p.mitraProfile.findUniqueOrThrow({ where: { userId: users[1].id } })).status, 'ON_DUTY');
    const refunded = event(customer, 'wallet:updated');
    assert.equal((await request('POST', `/orders/${id}/cancel`, tokens[0], { reason: 'Live check cleanup' })).body.status, 'CANCELLED');
    assert.equal((await refunded).data.balance, 500000);
    assert.equal((await request('POST', '/wallet/withdraw', tokens[1], { amount: 50000 })).status, 501);
    console.log('PASS live HTTP/Socket.IO: strict tokens, verified online, bid, winner notification, mitra read/history, tracking, denied access, refund, disabled payout');
  } finally {
    sockets.forEach(s => s.close());
    await new Promise(resolve => setTimeout(resolve, 100));
    const uids = users.map(u => u.id);
    await p.payment.deleteMany({ where: { orderId: { in: ids } } });
    await p.bid.deleteMany({ where: { orderId: { in: ids } } });
    await p.order.deleteMany({ where: { id: { in: ids } } });
    await p.walletTransaction.deleteMany({ where: { userId: { in: uids } } });
    await p.serviceMitra.deleteMany({ where: { serviceId: service?.id || '' } });
    await p.mitraProfile.deleteMany({ where: { userId: { in: uids } } });
    await p.user.deleteMany({ where: { id: { in: uids } } });
    if (service) await p.service.delete({ where: { id: service.id } });
    await p.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
