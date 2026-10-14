const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the real store/client modules with deterministic platform boundaries.
const cache = new Map();
let stored = null;
let fetchImpl;
const alerts = [];
const sockets = [];
function create(init) {
  const listeners = new Set();
  let state;
  const get = () => state;
  const set = (update) => {
    const before = state;
    state = { ...state, ...(typeof update === 'function' ? update(state) : update) };
    for (const listener of listeners) listener(state, before);
  };
  state = init(set, get);
  return { getState: get, setState: set, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
}
class Socket {
  connected = false;
  handlers = new Map();
  joins = [];
  on(event, fn) { this.handlers.set(event, fn); }
  onAny(fn) { this.any = fn; }
  fire(event, payload) { this.handlers.get(event)?.(payload); this.any?.(event, payload); }
  timeout(ms) { assert.equal(ms, 10000); return this; }
  async emitWithAck(event, payload) { this.joins.push({ event, payload }); if (this.failJoin) throw new Error('join timeout'); return { ok: true }; }
  removeAllListeners() { this.handlers.clear(); }
  disconnect() { this.connected = false; }
}
const mocks = {
  zustand: { create },
  'expo-secure-store': {
    getItemAsync: async () => stored,
    setItemAsync: async (_key, value) => { stored = value; },
    deleteItemAsync: async () => { stored = null; },
  },
  'react-native': { Alert: { alert: (...args) => alerts.push(args) } },
  'socket.io-client': { io: () => { const socket = new Socket(); sockets.push(socket); return socket; } },
};
function load(file) {
  file = path.resolve(__dirname, '../src', file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const requireLocal = (name) => {
    if (mocks[name]) return mocks[name];
    if (name.endsWith('/config')) return { API_URL: 'http://test', WS_URL: 'http://test/ws' };
    return load(path.resolve(path.dirname(file), `${name}.ts`));
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: requireLocal, fetch: (...args) => fetchImpl(...args), console }, { filename: file });
  return module.exports;
}
const tokens = (id) => ({ accessToken: `access-${id}`, refreshToken: `refresh-${id}`, user: { id } });
const response = (status, payload) => ({ status, ok: status >= 200 && status < 300, json: async () => payload, text: async () => JSON.stringify(payload) });
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function main() {
  const { useAuth } = load('store/auth.ts');
  const { api } = load('lib/api.ts');
  await useAuth.getState().login(tokens('one'));
  let release;
  let refreshCount = 0;
  fetchImpl = async () => { refreshCount++; return new Promise((resolve) => { release = resolve; }); };
  const first = useAuth.getState().tryRefresh();
  const second = useAuth.getState().tryRefresh();
  assert.equal(refreshCount, 1, 'concurrent refresh is single-flight');
  release(response(200, tokens('rotated')));
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(useAuth.getState().session.accessToken, 'access-rotated');

  const pending = useAuth.getState().tryRefresh();
  await useAuth.getState().logout();
  await useAuth.getState().login(tokens('new-account'));
  release(response(200, tokens('stale')));
  assert.equal(await pending, false);
  assert.equal(useAuth.getState().session.accessToken, 'access-new-account');
  assert.equal(JSON.parse(stored).accessToken, 'access-new-account');

  fetchImpl = async () => { throw new Error('offline'); };
  await assert.rejects(useAuth.getState().tryRefresh(), /offline/);
  assert.equal(useAuth.getState().session.accessToken, 'access-new-account', 'network errors retain session');

  let late;
  refreshCount = 0;
  fetchImpl = async (url, init) => {
    if (url.endsWith('/auth/refresh')) { refreshCount++; return response(200, tokens('latest')); }
    if (init.headers.Authorization === 'Bearer access-new-account') {
      if (url.endsWith('/late')) return new Promise((resolve) => { late = resolve; });
      return response(401, {});
    }
    return response(200, { ok: true });
  };
  const lateRequest = api('/late');
  await api('/early');
  late(response(401, {}));
  await lateRequest;
  assert.equal(refreshCount, 1, 'late 401 reuses already rotated access token');

  fetchImpl = async () => response(401, { message: 'expired' });
  assert.equal(await useAuth.getState().tryRefresh(), false);
  assert.equal(useAuth.getState().session, undefined);
  assert.equal(stored, null);

  const { realtime } = load('lib/realtime.ts');
  await useAuth.getState().login(tokens('socket'));
  const socket = sockets.at(-1);
  realtime.joinOrder('order-1');
  assert.equal(socket.joins.length, 0, 'no buffered join before transport connection');
  let syncs = 0;
  realtime.onReconnect(async () => { syncs++; });
  socket.connected = true;
  socket.fire('connect');
  await tick();
  assert.equal(socket.joins.length, 1);
  assert.equal(syncs, 1, 'reconnect sync follows successful room ack');
  socket.fire('connect');
  await tick();
  assert.equal(socket.joins.length, 2);
  assert.equal(syncs, 2);
  let balance;
  realtime.on('wallet:updated', (data) => { balance = data.balance; });
  socket.fire('wallet:updated', { event: 'wallet:updated', data: { balance: 123 } });
  assert.equal(balance, 123);
  socket.fire('wallet:updated', { balance: 999 });
  assert.equal(balance, 123, 'only documented envelopes are dispatched');
  socket.failJoin = true;
  socket.fire('connect');
  await tick();
  assert.equal(syncs, 2, 'timeout is never successful room readiness');
  const { useOrders } = load('store/orders.ts');
  const { useWallet } = load('store/catalog.ts');
  const order = { id: 'order-2', status: 'BIDDING', bids: [], service: {}, address: {} };
  fetchImpl = async (url) => {
    if (url.endsWith('/orders/mine')) return response(200, [order]);
    if (url.endsWith('/orders/order-2')) return response(200, { ...order, status: 'COMPLETED' });
    if (url.endsWith('/wallet')) return response(200, { balance: 456, currency: 'IDR' });
    return response(200, { data: [], total: 0 });
  };
  await useOrders.getState().fetchMyOrders();
  assert.equal(useOrders.getState().activeOrder.id, 'order-2');
  await useOrders.getState().fetchOrder('order-2');
  assert.equal(useOrders.getState().activeOrder, null, 'completed orders are not active');
  await useWallet.getState().fetchWallet();
  assert.equal(useWallet.getState().wallet.balance, 456);
  await useAuth.getState().logout();
  assert.equal(useOrders.getState().myOrders.length, 0, 'logout clears order cache');
  assert.equal(useWallet.getState().wallet, null, 'logout clears balance cache');
  await useAuth.getState().logout();
  assert.equal(realtime.orderIds.length, 0);
  assert.equal(socket.connected, false);
  console.log('Customer lifecycle assertions passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
