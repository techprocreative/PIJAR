import * as Location from 'expo-location';
import type { Socket } from 'socket.io-client';
import * as TaskManager from 'expo-task-manager';
import type { ServerEvent } from '@pijar/shared';
import { LOCATION_SEND_INTERVAL_MS } from '../config/env';
import { useOrderStore } from '../state/orders';
import { useAuthStore } from '../state/auth';
import { useWalletStore } from '../state/wallet';
import { connectSocket, getSocket, listenOrders, setSocket, stopListening } from '../realtime/socket';

export const BACKGROUND_LOCATION_TASK = 'pijar-mitra-location';
let foregroundSubscription: Location.LocationSubscription | null = null;
let starting: Promise<{ lat: number; lng: number }> | null = null;
let trackingGeneration = 0;
let lastSentAt = 0;

function pointFrom(loc: Location.LocationObject) {
  const { latitude: lat, longitude: lng, heading, accuracy } = loc.coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Lokasi tidak valid');
  return { lat, lng, ...(heading != null && Number.isFinite(heading) && heading >= 0 && heading < 360 ? { heading } : {}), ...(accuracy != null && Number.isFinite(accuracy) && accuracy >= 0 ? { accuracyM: accuracy } : {}) };
}

// Expo must see task definitions at module scope, including headless launches.
if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) { useOrderStore.setState({ error: error.message }); return; }
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
    if (!locations?.length) return;
    let temporarySocket: Socket | null = null;
    try {
      if (!useAuthStore.getState().tokens) await useAuthStore.getState().bootstrap();
      if (!useAuthStore.getState().tokens) return;
      if (!getSocket()) {
        // Headless restart resumes only a server-confirmed active assignment.
        await useOrderStore.getState().restoreActiveOrder();
        if (!useOrderStore.getState().active) return;
        temporarySocket = connectSocket(handleServerEvent);
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Koneksi lokasi habis waktu')), 8_000);
          temporarySocket!.once('connect', () => { clearTimeout(timer); resolve(); });
          temporarySocket!.once('connect_error', (err: Error) => { clearTimeout(timer); reject(err); });
          temporarySocket!.connect();
        });
      }
      if (useOrderStore.getState().online || useOrderStore.getState().active) await useOrderStore.getState().pushLocation(pointFrom(locations[locations.length - 1]));
    } catch (err) {
      useOrderStore.setState({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      if (temporarySocket) { temporarySocket.disconnect(); if (getSocket() === temporarySocket) setSocket(null); }
    }
  });
}

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export function startOnlineMode(): Promise<{ lat: number; lng: number }> {
  if (starting) return starting;
  const generation = trackingGeneration;
  starting = (async () => {
    const sock = getSocket();
    if (!sock?.connected) throw new Error('Koneksi realtime belum siap');
    const point = pointFrom(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    if (generation !== trackingGeneration) throw new Error('Sesi lokasi berakhir');
    await listenOrders(sock, point);
    if (generation !== trackingGeneration) throw new Error('Sesi lokasi berakhir');
    if (!foregroundSubscription) {
      const subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 25, timeInterval: LOCATION_SEND_INTERVAL_MS }, (loc) => {
        if (Date.now() - lastSentAt < LOCATION_SEND_INTERVAL_MS) return;
        lastSentAt = Date.now();
        void (async () => {
          try { await useOrderStore.getState().pushLocation(pointFrom(loc)); }
          catch (err) { useOrderStore.setState({ error: err instanceof Error ? err.message : String(err) }); }
        })();
      });
      if (generation !== trackingGeneration) { subscription.remove(); throw new Error('Sesi lokasi berakhir'); }
      foregroundSubscription = subscription;
    }
    useOrderStore.setState({ online: true });
    const background = await Location.getBackgroundPermissionsAsync();
    if (background.granted && !await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, { accuracy: Location.Accuracy.Balanced, deferredUpdatesInterval: LOCATION_SEND_INTERVAL_MS, pausesUpdatesAutomatically: false });
      if (generation !== trackingGeneration) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
    return point;
  })().catch(async (err) => {
    const sock = getSocket();
    if (sock?.connected && !useOrderStore.getState().active) {
      try { await stopListening(sock); }
      catch { sock.disconnect(); }
    }
    await stopLocationTracking();
    throw err;
  }).finally(() => { starting = null; });
  return starting;
}

export async function stopLocationTracking(): Promise<void> {
  trackingGeneration++;
  foregroundSubscription?.remove();
  foregroundSubscription = null;
  lastSentAt = 0;
  useOrderStore.setState({ online: false, newOrders: [] });
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
}

export async function goOffline(): Promise<void> {
  const sock = getSocket();
  if (!sock?.connected) throw new Error('Koneksi realtime belum siap');
  await stopListening(sock);
  await stopLocationTracking();
}

export async function syncConnection(): Promise<void> {
  await useOrderStore.getState().restoreActiveOrder();
  if (useOrderStore.getState().online || useOrderStore.getState().active) await startOnlineMode();
  await useWalletStore.getState().refresh();
}

export function handleServerEvent(event: ServerEvent): void {
  const orders = useOrderStore.getState();
  if (event.event === 'order:new') orders.ingestNewOrder(event.data);
  else if (event.event === 'order:matched') {
    void orders.adoptMatchedOrder(event.data).catch((err) => useOrderStore.setState({ error: String(err) }));
  } else if (event.event === 'order:status') orders.handleStatusEvent(event.data.orderId, event.data.status);
  else if (event.event === 'order:cancelled') orders.handleCancelEvent(event.data.orderId);
  else if (event.event === 'wallet:updated') void useWalletStore.getState().refresh();
  else if (event.event === 'mitra:status' && event.data.status === 'OFFLINE') {
    void stopLocationTracking().catch((err) => useOrderStore.setState({ error: String(err) }));
  }
}
