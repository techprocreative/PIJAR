/**
 * Komponen UI bersama app mitra — token desain kecil tanpa library eksternal.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

export const COLORS = {
  primary: '#7C3AED', // ungu PIJAR
  primaryDark: '#5B21B6',
  bg: '#F7F5FB',
  card: '#FFFFFF',
  text: '#1F2937',
  textMuted: '#6B7280',
  success: '#059669',
  warning: '#D97706',
  danger: '#DC2626',
  border: '#E5E7EB',
} as const;

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'danger' | 'success';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    variant === 'primary'
      ? COLORS.primary
      : variant === 'danger'
        ? COLORS.danger
        : variant === 'success'
          ? COLORS.success
          : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled || loading ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'outline' && {
          borderWidth: 1.5,
          borderColor: COLORS.primary,
          backgroundColor: 'transparent',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' ? COLORS.primary : '#fff'} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === 'outline' && { color: COLORS.primary },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function StatusChip({ status }: { status: string }) {
  const tone =
    status === 'BIDDING'
      ? COLORS.warning
      : status === 'MATCHED' ||
          status === 'MITRA_ON_THE_WAY' ||
          status === 'ARRIVED' ||
          status === 'IN_PROGRESS'
        ? COLORS.primary
        : status === 'COMPLETED' || status === 'SETTLED'
          ? COLORS.success
          : status === 'CANCELLED'
            ? COLORS.danger
            : COLORS.textMuted;
  return (
    <View style={[styles.chip, { backgroundColor: `${tone}18` }]}>
      <Text style={[styles.chipText, { color: tone }]}>{statusLabel(status)}</Text>
    </View>
  );
}
export function Heading({
  children,
  size = 20,
  muted,
  style,
}: {
  children: React.ReactNode;
  size?: number;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      style={[
        styles.heading,
        { fontSize: size, color: muted ? COLORS.textMuted : COLORS.text },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function BodyText({
  children,
  muted,
  style,
}: {
  children: React.ReactNode;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[styles.body, muted && { color: COLORS.textMuted }, style]}>{children}</Text>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

/** Label status Indonesia untuk tampilan. */
export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    BIDDING: 'Menunggu Penawaran',
    MATCHED: 'Terpilih — Menuju Lokasi?',
    MITRA_ON_THE_WAY: 'Menuju Lokasi',
    ARRIVED: 'Sudah Sampai',
    IN_PROGRESS: 'Sedang Dikerjakan',
    COMPLETED: 'Selesai',
    SETTLED: 'Dibayarkan',
    CANCELLED: 'Dibatalkan',
    DRAFT: 'Draft',
  };
  return map[status] ?? status;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  heading: {
    fontWeight: '800',
  },
  body: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 14,
    fontWeight: '600',
  },
});
