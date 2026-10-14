import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { COLORS } from '../../src/components/ui';
import { useOrders } from '../../src/store/orders';
import { useWallet } from '../../src/store/catalog';
import { useAuth } from '../../src/store/auth';
import { useEffect } from 'react';

function TabIcon({ label, color }: { label: string; color: string }) {
  return <Text style={{ fontSize: 18, textAlign: 'center', color }}>{label}</Text>;
}

export default function TabsLayout() {
  const fetchMyOrders = useOrders((s) => s.fetchMyOrders);
  const fetchWallet = useWallet((s) => s.fetchWallet);
  const session = useAuth((s) => s.session);

  useEffect(() => {
    if (session?.accessToken) {
      void fetchMyOrders().catch(() => undefined);
      void fetchWallet().catch(() => undefined);
    }
  }, [session?.accessToken, fetchMyOrders, fetchWallet]);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#fff',
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: { borderTopColor: COLORS.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Beranda',
          tabBarIcon: ({ color }) => <TabIcon label="🏠" color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Pesanan',
          tabBarIcon: ({ color }) => <TabIcon label="🧾" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => <TabIcon label="👤" color={color} />,
        }}
      />
    </Tabs>
  );
}
