// Run: node apps/admin/scripts/session-regression.mjs (from repository root).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const modules = new Map();
const storage = new Map();
const timers = new Map();
let timerId = 0;
let fetchImpl;
let latestSocket;
const context = vm.createContext({
  Headers, Response, Date, atob,
  fetch: (...args) => fetchImpl(...args),
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
  window: { setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; } },
  clearTimeout: (id) => timers.delete(id),
});
class FakeSocket {
  connected = false;
  active = false;
  handlers = new Map();
  constructor(options) { this.options = options; }
  on(event, callback) {
    const handlers = this.handlers.get(event) ?? new Set();
    handlers.add(callback);
    this.handlers.set(event, handlers);
    return this;
  }
  off(event, callback) { this.handlers.get(event)?.delete(callback); return this; }
  emit(event, ...args) { for (const callback of this.handlers.get(event) ?? []) callback(...args); }
  connect() {
    this.options.auth((auth) => {
      this.auth = auth;
      this.connected = true;
      this.emit('connect');
    });
    return this;
  }
  disconnect() { this.connected = false; this.emit('disconnect', 'io client disconnect'); return this; }
  close() { return this.disconnect(); }
  removeAllListeners() { this.handlers.clear(); }
}
function load(path) {
  if (modules.has(path)) return modules.get(path).exports;
  const module = { exports: {} };
  modules.set(path, module);
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInContext(`(function(require, module, exports) {${source}\n})`, context, { filename: path })(
    (id) => id === 'socket.io-client'
      ? { io: (_url, options) => (latestSocket = new FakeSocket(options)) }
      : load(resolve(dirname(path), `${id}.ts`)),
    module, module.exports,
  );
  return module.exports;
}
const session = load(resolve(root, 'auth/session.ts'));
const api = load(resolve(root, 'api/authorized.ts'));
const realtime = load(resolve(root, 'realtime/socket.ts'));
const tokens = (accessToken, refreshToken = `${accessToken}-refresh`) => ({
  accessToken, refreshToken, user: { id: 'admin', role: 'ADMIN' },
});
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function flush() { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }
async function runTimer() {
  const [id, callback] = timers.entries().next().value;
  timers.delete(id);
  callback();
  await flush();
}

// Concurrent refresh and delayed 401s rotate only once.
session.setSession(tokens('old'));
const rotation = deferred();
let refreshes = 0;
fetchImpl = () => { refreshes += 1; return rotation.promise; };
const first = api.getFreshToken('old');
const second = api.getFreshToken('old');
rotation.resolve(json(tokens('fresh')));
assert.deepEqual(await Promise.all([first, second]), ['fresh', 'fresh']);
assert.equal(await api.getFreshToken('old'), 'fresh');
assert.equal(refreshes, 1);

// Logout/login while rotating cannot resurrect or overwrite a newer session.
session.setSession(tokens('before-logout'));
const pending = deferred();
fetchImpl = () => pending.promise;
const stale = api.getFreshToken('before-logout');
session.clearSession();
session.setSession(tokens('new-login'));
pending.resolve(json(tokens('stale-result')));
await assert.rejects(stale);
assert.equal(session.getSession().accessToken, 'new-login');

// Transient refresh/HTTP failures preserve credentials; auth rejection clears them.
fetchImpl = async () => { throw new Error('offline'); };
await assert.rejects(api.getFreshToken('new-login'));
assert.equal(session.getSession().accessToken, 'new-login');
fetchImpl = async () => json({ message: 'revoked' }, 401);
await assert.rejects(api.getFreshToken('new-login'));
assert.equal(session.getSession(), null);

// Actual authorized requests retry using Headers and the rotated token.
session.setSession(tokens('request-old'));
refreshes = 0;
fetchImpl = async (path, init) => {
  if (path === '/v1/auth/refresh') { refreshes += 1; return json(tokens('request-new')); }
  assert.equal(init.headers.get('x-request'), 'kept');
  return init.headers.get('authorization') === 'Bearer request-new' ? json({ ok: true }) : json({}, 401);
};
assert.equal((await api.authorizedJson('/private', { headers: new Headers({ 'x-request': 'kept' }) })).ok, true);
assert.equal(refreshes, 1);
let requests = 0;
fetchImpl = async (path) => {
  if (path === '/v1/auth/refresh') return json(tokens('after-network-error'));
  if (++requests === 1) return json({}, 401);
  throw new Error('offline retry');
};
await assert.rejects(api.authorizedFetch('/private'));
assert.equal(session.getSession().accessToken, 'after-network-error');

// Reconnect resync callback, fresh dynamic auth, and bounded server-auth recovery.
session.setSession(tokens('socket-old'));
let connects = 0;
const unsubscribe = realtime.subscribeAdminEvents(() => {}, () => { connects += 1; });
const socket = latestSocket;
assert.equal(connects, 1);
session.setSession(tokens('socket-current'), session.getSession());
socket.connect();
assert.equal(socket.auth.token, 'socket-current');
assert.equal(connects, 2);
fetchImpl = async () => json(tokens('socket-refreshed'));
socket.connected = false;
socket.emit('disconnect', 'io server disconnect');
await runTimer();
assert.equal(socket.auth.token, 'socket-refreshed');
assert.equal(connects, 3);
socket.emit('disconnect', 'io server disconnect');
assert.equal(session.getSession(), null);
unsubscribe();
assert.equal(timers.size, 0);

// Expired persisted token refreshes before the next handshake.
const expired = `e30.${Buffer.from(JSON.stringify({ exp: 1 })).toString('base64url')}.sig`;
session.setSession(tokens(expired));
fetchImpl = async () => json(tokens('preflight-refreshed'));
const stop = realtime.subscribeAdminEvents(() => {}, () => {});
await flush();
assert.equal(latestSocket.auth.token, 'preflight-refreshed');
stop();
console.log('admin session/realtime regression assertions passed');
