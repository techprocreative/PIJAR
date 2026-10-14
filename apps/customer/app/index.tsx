import { Redirect, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../src/store/auth';
import { useServices } from '../src/store/catalog';
import { COLORS } from '../src/components/ui';

/** Index = router auth: ke login bila belum masuk, ke tabs bila sudah. */
export default function Index() {
  const session = useAuth((s) => s.session);
  const fetchServices = useServices((s) => s.fetchServices);
  const router = useRouter();

  useEffect(() => {
    if (session?.accessToken) void fetchServices();
  }, [session?.accessToken, fetchServices]);

  if (session === null) {
    // masih loading — tampilkan splash sederhana
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary }}>
        <Text style={{ color: '#fff', fontSize: 40, fontWeight: '900' }}>PIJAR</Text>
        <Text style={{ color: '#FFEDD5' }}>Pijat & Wellness On-Demand</Text>
      </View>
    );
  }
  if (session?.accessToken) return <Redirect href="/(tabs)" />;
  return <Redirect href="/login" />;
}
