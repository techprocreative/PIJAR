import { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextProps, TextStyle, TouchableOpacity, View, ViewStyle } from 'react-native';

export const COLORS = {
  primary: '#C2410C', // oranye gelap — kontras teks putih ≥ 4.5:1 (WCAG AA)
  primaryDark: '#9A3412',
  bg: '#F8FAFC',
  card: '#FFFFFF',
  border: '#E2E8F0',
  text: '#0F172A',
  textMuted: '#64748B',
  success: '#16A34A',
  danger: '#DC2626',
  info: '#2563EB',
};

/** Status order → warna badge. Dipakai lintas layar. */
export const STATUS_COLOR: Record<string, string> = {
  BIDDING: COLORS.info,
  MATCHED: COLORS.primary,
  MITRA_ON_THE_WAY: COLORS.info,
  ARRIVED: COLORS.primary,
  IN_PROGRESS: '#7C3AED',
  COMPLETED: COLORS.success,
  SETTLED: COLORS.success,
  CANCELLED: COLORS.danger,
};

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View
      style={[styles.badge, { backgroundColor: `${color}1A` }]}
      accessibilityRole="text"
      accessibilityLabel={`Status: ${label}`}
    >
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: ButtonProps) {
  const bg =
    variant === 'primary' ? COLORS.primary : variant === 'danger' ? COLORS.danger : 'transparent';
  const border = variant === 'outline' ? { borderWidth: 1, borderColor: COLORS.primary } : {};
  const textColor = variant === 'primary' || variant === 'danger' ? '#fff' : COLORS.primaryDark;
  const opacity = disabled || loading ? 0.55 : 1;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      style={[styles.button, { backgroundColor: bg, opacity }, border, style]}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.buttonText, { color: textColor }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

type TypographyProps = TextProps & {
  variant?: 'h1' | 'h2' | 'body' | 'muted' | 'small';
  style?: TextStyle;
  children: ReactNode;
};

export function Typography({ variant = 'body', style, children, ...rest }: TypographyProps) {
  const variantStyle: TextStyle =
    variant === 'h1'
      ? styles.h1
      : variant === 'h2'
        ? styles.h2
        : variant === 'muted'
          ? styles.muted
          : variant === 'small'
            ? styles.small
            : styles.body;
  return (
    <Text style={[variantStyle, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  button: {
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  h1: { color: COLORS.text, fontSize: 26, fontWeight: '800' },
  h2: { color: COLORS.text, fontSize: 19, fontWeight: '700' },
  body: { color: COLORS.text, fontSize: 15, lineHeight: 21 },
  muted: { color: COLORS.textMuted, fontSize: 14, lineHeight: 20 },
  small: { color: COLORS.textMuted, fontSize: 12, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 10 },
});
