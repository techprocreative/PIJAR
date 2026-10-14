/**
 * Main tabs — Home (order) & Wallet, dengan bottom tab bar custom.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HomeScreen } from './screens/HomeScreen';
import { WalletScreen } from './screens/WalletScreen';
import { COLORS } from './components/ui';

type Tab = 'home' | 'wallet';

export function MainTabs() {
  const [tab, setTab] = useState<Tab>('home');

  return (
    <View style={styles.flex}>
      <View style={styles.flex}>
        {tab === 'home' ? <HomeScreen /> : <WalletScreen />}
      </View>
      <View style={styles.tabBar}>
        <TabButton
          label="Order"
          active={tab === 'home'}
          onPress={() => setTab('home')}
          icon="◎"
        />
        <TabButton
          label="Saldo"
          active={tab === 'wallet'}
          onPress={() => setTab('wallet')}
          icon="Rp"
        />
      </View>
    </View>
  );
}

function TabButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.tabButton}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.tabIcon, active && { color: COLORS.primary }]}>{icon}</Text>
      <Text style={[styles.tabLabel, active && { color: COLORS.primary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.bg },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 8,
    paddingBottom: 12,
  },
  tabButton: { flex: 1, alignItems: 'center' },
  tabIcon: { fontSize: 20, color: COLORS.textMuted, fontWeight: '700' },
  tabLabel: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, fontWeight: '600' },
});
