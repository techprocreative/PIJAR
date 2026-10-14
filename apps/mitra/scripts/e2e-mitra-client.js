/**
 * UJI E2E CLIENT LOGIC — app mitra vs API PIJAR.
 * Menguji tepat jalur yang dipakai apps/mitra/src (client.ts, orders.ts):
 *  1. OTP login mitra (devCode)
 *  2. WS connect /ws auth token + mitra:listen_orders
 *  3. Customer buat order → mitra terima order:new
 *  4. placeBid (REST) → customer accept
 *  5. PROBE MATCHED (teknik orders.ts): re-upsert bid → 400 fase bidding
 *     → order:join ack ok = kita pemenang
 *  6. transition MATCHED → ... → COMPLETED
 *  7. mitra:location dengan orderId → relay tracking
 *  8. wallet + withdraw + transactions
 *  9. rating mitra → customer
 */
const { io } = require('socket.io-client');
const API = 'http://localhost:3001';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? '✓' : '✗ FAIL'} ${label}`);
  if (!cond) failures++;
};

async function auth(phone, role, name) {
  const req = await fetch(`${API}/v1/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  }).then((r) => r.json());
  const ver = await fetch(`${API}/v1/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: req.devCode, role, name }),
  }).then((r) => r.json());
  return ver;
}

function connect(token) {
  const socket = io(`${API}/ws`, { auth: { token }, transports: ['websocket'] });
  return new Promise((res, rej) => {
    socket.once('connect', () => res(socket));
    socket.once('connect_error', rej);
  });
}

function once(socket, event, timeoutMs = 12000) {
  return new Promise((res) => {
    const t = setTimeout(() => res(null), timeoutMs);
    socket.once(event, (d) => { clearTimeout(t); res(d); });
  });
}

async function main() {
  console.log('— 1. OTP login mitra —');
  const mitra = await auth('+628000000002', 'MITRA');
  ok(mitra.accessToken && mitra.user.role === 'MITRA', 'login mitra + token');

  console.log('— 2. WS connect + listen_orders —');
  const sock = await connect(mitra.accessToken);
  const ack = await sock.emitWithAck('mitra:listen_orders', { lat: -6.19, lng: 106.78 });
  ok(ack?.ok === true, 'mitra:listen_orders ack');

  console.log('— 3. order:new broadcast —');
  const cust = await auth('+628000000099', 'CUSTOMER', 'Uji Customer');
  const pendingNew = once(sock, 'order:new');
  const order = await fetch(`${API}/v1/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cust.accessToken}` },
    body: JSON.stringify({
      serviceId: 'seed-reflexology-45',
      addressLabel: 'Apartemen',
      addressDetail: 'Jl. E2E Mitra No. 1, Jakarta',
      location: { lat: -6.2, lng: 106.8 },
      customerPrice: 120000,
      therapistGenderPreference: 'FEMALE',
    }),
  }).then((r) => r.json());
  ok(order.status === 'BIDDING', `order dibuat (${order.status})`);
  const newEvt = (await pendingNew)?.data;
  ok(newEvt?.id === order.id, 'order:new diterima realtime');

  console.log('— 4. placeBid + customer accept —');
  const J = { 'Content-Type': 'application/json', Authorization: `Bearer ${mitra.accessToken}` };
  const bid = await fetch(`${API}/v1/orders/${order.id}/bids`, {
    method: 'POST', headers: J, body: JSON.stringify({ price: 130000, etaMinutes: 15 }),
  }).then((r) => r.json());
  ok(bid.id != null, `bid terkirim (${bid.id?.slice(0, 8)}…)`);

  const acc = await fetch(`${API}/v1/orders/${order.id}/accept-bid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cust.accessToken}` },
    body: JSON.stringify({ bidId: bid.id }),
  }).then((r) => r.json());
  ok(acc.status === 'MATCHED', 'customer accept bid');

  console.log('— 5. PROBE MATCHED (teknik orders.ts) —');
  // re-upsert bid yang sama → harus 400 "Order tidak dalam fase bidding"
  const probe = await fetch(`${API}/v1/orders/${order.id}/bids`, {
    method: 'POST', headers: J, body: JSON.stringify({ price: 130000, etaMinutes: 15 }),
  });
  const probeBody = await probe.json().catch(() => null);
  ok(
    probe.status === 400 && JSON.stringify(probeBody).includes('tidak dalam fase bidding'),
    `probe re-upsert 400 fase bidding (status ${probe.status})`,
  );
  // joinOrderRoom → ack ok (kita pemenang)
  const joinAck = await sock.emitWithAck('order:join', { orderId: order.id });
  ok(joinAck?.ok === true, 'order:join ack ok → MATCHED ke mitra ini');

  console.log('— 6. transisi status (MATCHED → COMPLETED) —');
  let tr;
  for (const st of ['MITRA_ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED']) {
    tr = await fetch(`${API}/v1/orders/${order.id}/status`, {
      method: 'POST', headers: J, body: JSON.stringify({ status: st }),
    }).then((r) => r.json());
    if (tr.status !== st) ok(false, `transisi ${st} gagal: ${JSON.stringify(tr).slice(0, 120)}`);
  }
  ok(tr.status === 'COMPLETED', 'transisi sampai COMPLETED');

  console.log('— 7. tracking:location relay —');
  const custSock = await connect(cust.accessToken);
  await custSock.emitWithAck('order:join', { orderId: order.id });
  const pendingTrack = once(custSock, 'tracking:location');
  const locAck = await sock.emitWithAck('mitra:location', {
    lat: -6.198, lng: 106.799, heading: 45, orderId: order.id,
  });
  ok(locAck?.ok === true, 'mitra:location ack');
  const track = (await pendingTrack)?.data;
  ok(track?.orderId === order.id, 'tracking:location diterima customer');

  console.log('— 8. wallet (settlement async) —');
  await sleep(2000); // settlement async COMPLETED → SETTLED + wallet:updated
  const wallet = await fetch(`${API}/v1/wallet`, { headers: J }).then((r) => r.json());
  const txns = await fetch(`${API}/v1/wallet/transactions`, { headers: J }).then((r) => r.json());
  const earning = txns.data?.find((t) => t.type === 'ORDER_EARNING');
  ok(earning != null, `ORDER_EARNING tercatat (${earning?.amount})`);
  ok(wallet.balance === (earning?.balanceAfter ?? wallet.balance), 'saldo konsisten');

  console.log('— 9. rating mitra → customer —');
  const rate = await fetch(`${API}/v1/ratings`, {
    method: 'POST', headers: J,
    body: JSON.stringify({ orderId: order.id, stars: 5, comment: 'Customer ramah', toRole: 'CUSTOMER' }),
  });
  ok(rate.status === 201 || rate.ok, `rating terkirim (${rate.status})`);

  sock.close(); custSock.close(); await sleep(300);
  console.log(failures === 0 ? '\nSEMUA UJI CLIENT MITRA LULUS ✓' : `\n${failures} UJI GAGAL ✗`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
