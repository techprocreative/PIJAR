/**
 * Root navigator — Login ↔ MainTabs; state auth (zustand) menentukan rute.
 */
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from './state/auth';
import { LoginScreen } from './screens/LoginScreen';
import { MainTabs } from './MainTabs';

export function AppNavigator() {
  const tokens = useAuthStore((s) => s.tokens);
  const phase = useAuthStore((s) => s.phase);

  if (phase === 'boot') {
    return (
      <>
        <StatusBar style="dark" />
      </>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      {tokens ? <MainTabs /> : <LoginScreen />}
    </>
  );
}
