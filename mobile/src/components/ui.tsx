/** Small themed building blocks shared across screens. */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { colors, radius } from '../theme';

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Badge({
  text,
  tone = 'muted',
}: {
  text: string;
  tone?: 'amber' | 'green' | 'red' | 'blue' | 'muted';
}) {
  const toneColor = {
    amber: colors.amber,
    green: colors.green,
    red: colors.red,
    blue: colors.blue,
    muted: colors.textMuted,
  }[tone];
  return (
    <View style={[styles.badge, { borderColor: toneColor + '55', backgroundColor: toneColor + '18' }]}>
      <Text style={[styles.badgeText, { color: toneColor }]}>{text}</Text>
    </View>
  );
}

/** A horizontal progress/level bar. `value` and `max` define the fill. */
export function Bar({
  value,
  max,
  color = colors.amber,
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

export function Button({
  title,
  onPress,
  tone = 'primary',
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  tone?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}) {
  const bg =
    tone === 'primary' ? colors.amber : tone === 'danger' ? colors.red + '22' : 'rgba(255,255,255,0.06)';
  const fg =
    tone === 'primary' ? colors.nightStart : tone === 'danger' ? colors.red : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        tone !== 'primary' && styles.buttonBordered,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

/** A simple on/off switch styled like the web toggle. */
export function Toggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      style={[
        styles.toggle,
        { backgroundColor: value ? colors.amber : '#4b5563', opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <View style={[styles.knob, { alignSelf: value ? 'flex-end' : 'flex-start' }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBg,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 18,
  },
  sectionTitle: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  badge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  barTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  button: {
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonBordered: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: radius.pill,
    padding: 3,
    justifyContent: 'center',
  },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
  },
});
