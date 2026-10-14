/**
 * SMOKE TEST — alur customer app terhadap API live.
 * Mensimulasikan persis panggilan yang dilakukan apps/customer:
 *  1. OTP login (CUSTOMER) — seperti app/login.tsx
 *  2. GET /v1/services — seperti (tabs)/index.tsx
 *  3. POST /v1/orders — seperti order/new.tsx (bidding)
 *  4. WS order:join — seperti lib/realtime.ts
 *  5. mitra bid (sebagai mitra) → customer terima order:bid
 *  6. POST accept-bid — seperti order/[id].tsx
 *  7. tracking:location → customer terima tracking (live map)
 *  8. transisi status → order:status
 *  9. cancel flow
 * 10. wallet endpoints — seperti (tabs)/profile.tsx
 *
 * Jalankan: node scripts/smoke-customer.js
 */
const { io } = require('socket.io-client');
const API = process.env.API ?? 'http://localhost:3001';

let failures = 0;
function assert(cond, label) {
  console.log(`${cond ? '✓' : '✗ FAIL'} ${label}`);
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, payload };
}

async function auth(phone, role) {
  const otp = await req('POST', '/v1/auth/otp/request', { phone });
  assert(otp.ok && otp.payload.devCode, `OTP request ${phone} (${role})`);
  const ver = await req('POST', '/v1/auth/otp/verify', {
    phone,
    code: otp.payload.devCode,
    role,
  });
  assert(ver.ok && ver.payload.accessToken, `OTP verify ${phone} → token`);
  return ver.payload;
}

function once(socket, event, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const receive = (data) => {
      clearTimeout(timer);
      resolve(data);
    };
    const timer = setTimeout(() => {
      socket.off(event, receive);
      reject(new Error(`Timeout menunggu ${event}`));
    }, timeoutMs);
    socket.once(event, receive);
  });
}

async function main() {
  console.log('— login customer + mitra —');
  const cust = await auth('+628000000009', 'CUSTOMER');
  const mitra = await auth('+628000000002', 'MITRA');

  console.log('— services —');
  const services = await req('GET', '/v1/services', null, cust.accessToken);
  assert(Array.isArray(services.payload) && services.payload.length > 0, `services: ${services.payload?.length} layanan`);

  console.log('— wallet (customer) —');
  const wallet = await req('GET', '/v1/wallet', null, cust.accessToken);
  assert(wallet.ok && typeof wallet.payload.balance === 'number', `wallet balance: ${wallet.payload?.balance}`);

  console.log('— buat order (bidding) —');
  const created = await req(
    'POST',
    '/v1/orders',
    {
      serviceId: services.payload[0].id,
      addressLabel: 'Rumah',
      addressDetail: 'Jl. Smoke Test No. 1, Jakarta',
      location: { lat: -6.2, lng: 106.8 },
      customerPrice: services.payload[0].basePrice,
      therapistGenderPreference: 'FEMALE',
      notes: 'tes smoke customer app',
    },
    cust.accessToken,
  );
  assert(created.ok && created.payload.status === 'BIDDING', `order BIDDING: ${created.payload?.id}`);
  const orderId = created.payload.id;

  console.log('— WS customer join + mitra online —');
  const custSocket = io(`${API}/ws`, { auth: { token: cust.accessToken }, transports: ['websocket'] });
  const mitraSocket = io(`${API}/ws`, { auth: { token: mitra.accessToken }, transports: ['websocket'] });
  await Promise.all([
    once(custSocket, 'connect'),
    once(mitraSocket, 'connect'),
  ]);
  const joinAck = await custSocket.timeout(10000).emitWithAck('order:join', { orderId });
  assert(joinAck?.ok === true, 'order:join ack');
  const listenAck = await mitraSocket.timeout(10000).emitWithAck('mitra:listen_orders', { lat: -6.19, lng: 106.78 });
  assert(listenAck?.ok === true, 'mitra:listen_orders ack');

  console.log('— mitra bid → customer terima order:bid (envelope) —');
  const pendingBid = once(custSocket, 'order:bid');
  const bid = await req(
    'POST',
    `/v1/orders/${orderId}/bids`,
    { price: created.payload.customerPrice, etaMinutes: 15 },
    mitra.accessToken,
  );
  assert(bid.ok && bid.payload.id, `bid dibuat: ${bid.payload?.id}`);
  const bidEvt = await pendingBid;
  assert(
    bidEvt && bidEvt.event === 'order:bid' && bidEvt.data?.id === bid.payload.id,
    'order:bid envelope { event, data } — sesuai asumsi lib/realtime.ts',
  );

  console.log('— accept bid → matched —');
  const pendingMatch = once(custSocket, 'order:matched');
  const accepted = await req(
    'POST',
    `/v1/orders/${orderId}/accept-bid`,
    { bidId: bid.payload.id },
    cust.accessToken,
  );
  assert(accepted.ok && accepted.payload.status === 'MATCHED', `accept-bid: ${accepted.payload?.status}`);
  const matchEvt = await pendingMatch;
  assert(matchEvt?.data?.status === 'MATCHED', 'order:matched realtime');

  console.log('— tracking live —');
  const pendingTrack = once(custSocket, 'tracking:location');
  const locAck = await mitraSocket.timeout(10000).emitWithAck('mitra:location', {
    lat: -6.195,
    lng: 106.805,
    orderId,
    heading: 90,
  });
  assert(locAck?.ok === true, 'mitra:location ack');
  const trackEvt = await pendingTrack;
  assert(trackEvt?.data?.orderId === orderId, 'tracking:location realtime');

  console.log('— transisi status —');
  const pendingStatus = once(custSocket, 'order:status');
  const tr = await req(
    'POST',
    `/v1/orders/${orderId}/status`,
    { status: 'MITRA_ON_THE_WAY' },
    mitra.accessToken,
  );
  assert(tr.ok && tr.payload.status === 'MITRA_ON_THE_WAY', 'transisi MITRA_ON_THE_WAY');
  const stEvt = await pendingStatus;
  assert(stEvt?.data?.status === 'MITRA_ON_THE_WAY', 'order:status realtime');

  console.log('— riwayat orders/mine —');
  const mine = await req('GET', '/v1/orders/mine', null, cust.accessToken);
  assert(mine.ok && Array.isArray(mine.payload) && mine.payload.some((o) => o.id === orderId), 'orders/mine memuat order baru');

  console.log('— cancel —');
  const pendingCancel = once(custSocket, 'order:cancelled');
  const cancelled = await req(
    'POST',
    `/v1/orders/${orderId}/cancel`,
    { reason: 'smoke test customer app' },
    cust.accessToken,
  );
  assert(cancelled.ok && cancelled.payload.status === 'CANCELLED', 'cancel ok');
  const cancelEvt = await pendingCancel;
  assert(cancelEvt?.data?.orderId === orderId, 'order:cancelled realtime');

  console.log('— refresh token rotation —');
  const refreshed = await req('POST', '/v1/auth/refresh', { refreshToken: cust.refreshToken });
  assert(refreshed.ok && refreshed.payload.accessToken, 'refresh token → token baru');

  custSocket.close();
  mitraSocket.close();
  await sleep(300);

  console.log(failures === 0 ? '\nSMOKE CUSTOMER APP LULUS ✓' : `\n${failures} UJI GAGAL ✗`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
