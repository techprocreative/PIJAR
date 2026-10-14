import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Alert, useColorScheme } from 'react-native';
import { useAuth } from '../src/store/auth';
import { useOrders } from '../src/store/orders';
import { realtime } from '../src/lib/realtime';

export default function RootLayout() {
  const scheme = useColorScheme();
  const session = useAuth((s) => s.session);
  const router = useRouter();
  const segments = useSegments();
  const hydrate = useAuth((s) => s.hydrate);
  const bindRealtime = useOrders((s) => s.bindRealtime);

  useEffect(() => {
    void hydrate().catch((error: unknown) => Alert.alert('Gagal memulihkan sesi', error instanceof Error ? error.message : 'Silakan masuk kembali'));
  }, [hydrate]);

  useEffect(() => bindRealtime(), [bindRealtime]);
  useEffect(() => {
    if (session?.accessToken) realtime.connect();
  }, [session?.accessToken]);

  useEffect(() => {
    if (session === undefined && segments[0] !== 'login') router.replace('/login');
  }, [session, segments, router]);

  // session === null → masih restore dari SecureStore; render Stack kosong (splash).
  if (session === null) return null;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#F97316' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '800' },
          contentStyle: { backgroundColor: '#F8FAFC' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false, title: 'Masuk' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="order/[id]" options={{ title: 'Pesanan' }} />
        <Stack.Screen name="order/new" options={{ title: 'Pesan Pijat', presentation: 'modal' }} />
        <Stack.Screen name="order/rate/[id]" options={{ title: 'Beri Rating', presentation: 'modal' }} />
      </Stack>
    </>
  );
}
