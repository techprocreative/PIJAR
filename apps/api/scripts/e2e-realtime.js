/**
 * UJI E2E REALTIME GATEWAY — Socket.IO
 *
 * Skenario (kontrak ARCHITECTURE.md flow bidding real-time):
 *  1. Mitra connect WS + mitra:listen_orders → harus terima order:new saat customer buat order
 *  2. Customer connect WS + order:join → harus terima order:bid saat mitra bid
 *  3. Customer accept bid → semua pihak di room order terima order:matched
 *  4. Mitra kirim mitra:location dengan orderId → customer terima tracking:location
 *  5. Mitra transisi status → customer terima order:status
 *  6. Wrong token → koneksi ditolak
 *
 * Jalankan: node scripts/e2e-realtime.js (server harus jalan + DB ter-seed)
 */
const { io } = require('socket.io-client');
const API = process.env.API ?? 'http://localhost:3001';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;

function assert(cond, label) {
  console.log(`${cond ? '✓' : '✗ FAIL'} ${label}`);
  if (!cond) failures++;
}

async function auth(phone, role) {
  const req = await fetch(`${API}/v1/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  }).then((r) => r.json());
  const ver = await fetch(`${API}/v1/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: req.devCode, role }),
  }).then((r) => r.json());
  return ver.accessToken;
}

function connect(token) {
  const socket = io(`${API}/ws`, { auth: { token }, transports: ['websocket'] });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (e) => reject(e));
  });
}

function once(socket, event, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), timeoutMs);
    socket.once(event, (data) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

async function main() {
  console.log('— auth —');
  const mitraTok = await auth('+628000000002', 'MITRA');
  const custTok = await auth('+628000000009', 'CUSTOMER');
  console.log('token ok');

  console.log('— handshake —');
  // token salah → ditolak
  const bad = io(`${API}/ws`, { auth: { token: 'salah' }, transports: ['websocket'] });
  // handleConnection async: socket bisa 'connect' dulu lalu diputus server saat verifikasi gagal
  const badOutcome = await new Promise((res) => {
    bad.once('connect_error', () => res('rejected'));
    bad.once('connect', () => bad.once('disconnect', () => res('disconnected')));
  });
  assert(
    badOutcome === 'rejected' || badOutcome === 'disconnected',
    `token salah ditolak server (${badOutcome})`,
  );
  bad.close();

  const mitraSocket = await connect(mitraTok);
  const custSocket = await connect(custTok);
  assert(mitraSocket.connected && custSocket.connected, 'kedua socket terhubung');

  console.log('— mitra listen orders —');
  const ack = await mitraSocket.emitWithAck('mitra:listen_orders', { lat: -6.19, lng: 106.78 });
  assert(ack?.ok === true, `mitra:listen_orders ack: ${JSON.stringify(ack)}`);

  console.log('— customer buat order → mitra harus terima order:new —');
  const pendingNew = once(mitraSocket, 'order:new');
  const order = await fetch(`${API}/v1/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custTok}` },
    body: JSON.stringify({
      serviceId: 'seed-reflexology-45',
      addressLabel: 'Rumah',
      addressDetail: 'Jl. Uji WS No. 7, Jakarta',
      location: { lat: -6.2, lng: 106.8 },
      customerPrice: 100000,
    }),
  }).then((r) => r.json());
  assert(order.status === 'BIDDING', `order dibuat: ${order.id} (${order.status})`);

  const newEvt = (await pendingNew)?.data;
  assert(
    newEvt?.id === order.id && newEvt?.status === 'BIDDING',
    `mitra terima order:new realtime (order sama: ${newEvt?.id === order.id})`,
  );

  console.log('— customer join room order —');
  const joinAck = await custSocket.emitWithAck('order:join', { orderId: order.id });
  assert(joinAck?.ok === true, 'customer join room order');

  console.log('— mitra bid → customer harus terima order:bid —');
  const pendingBid = once(custSocket, 'order:bid');
  const bid = await fetch(`${API}/v1/orders/${order.id}/bids`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mitraTok}` },
    body: JSON.stringify({ price: 110000, etaMinutes: 20 }),
  }).then((r) => r.json());
  assert(bid.id != null, `bid dibuat: ${bid.id}`);

  const bidEvt = (await pendingBid)?.data;
  assert(
    bidEvt?.id === bid.id && bidEvt?.price === 110000,
    `customer terima order:bid realtime (price: ${bidEvt?.price})`,
  );

  console.log('— customer accept → order:matched —');
  const pendingMatch = once(custSocket, 'order:matched');
  const acc = await fetch(`${API}/v1/orders/${order.id}/accept-bid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custTok}` },
    body: JSON.stringify({ bidId: bid.id }),
  }).then((r) => r.json());
  assert(acc.status === 'MATCHED', `order matched (${acc.status})`);

  const matchEvt = (await pendingMatch)?.data;
  assert(matchEvt?.status === 'MATCHED', 'customer terima order:matched realtime');

  console.log('— tracking lokasi mitra —');
  const pendingTrack = once(custSocket, 'tracking:location');
  const locAck = await mitraSocket.emitWithAck('mitra:location', {
    lat: -6.195,
    lng: 106.805,
    heading: 90,
    orderId: order.id,
  });
  assert(locAck?.ok === true, 'mitra:location ack');
  const trackEvt = (await pendingTrack)?.data;
  assert(
    trackEvt?.orderId === order.id && Math.abs(trackEvt.location.lat + 6.195) < 1e-9,
    `customer terima tracking:location realtime (${JSON.stringify(trackEvt?.location)})`,
  );

  console.log('— transisi status → order:status —');
  const pendingStatus = once(custSocket, 'order:status');
  const tr = await fetch(`${API}/v1/orders/${order.id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mitraTok}` },
    body: JSON.stringify({ status: 'MITRA_ON_THE_WAY' }),
  }).then((r) => r.json());
  assert(tr.status === 'MITRA_ON_THE_WAY', 'transisi MITRA_ON_THE_WAY ok');
  const stEvt = (await pendingStatus)?.data;
  assert(stEvt?.status === 'MITRA_ON_THE_WAY', 'customer terima order:status realtime');

  console.log('— cancel flow → order:cancelled —');
  const pendingCancel = once(custSocket, 'order:cancelled');
  const cancel = await fetch(`${API}/v1/orders/${order.id}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custTok}` },
    body: JSON.stringify({ reason: 'uji e2e ws' }),
  }).then((r) => r.json());
  assert(cancel.status === 'CANCELLED', `order cancelled (${cancel.status})`);
  const cancelEvt = (await pendingCancel)?.data;
  assert(cancelEvt?.orderId === order.id, 'customer terima order:cancelled realtime');

  mitraSocket.close();
  custSocket.close();
  await sleep(300);

  console.log(failures === 0 ? '\nSEMUA UJI REALTIME LULUS ✓' : `\n${failures} UJI GAGAL ✗`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
