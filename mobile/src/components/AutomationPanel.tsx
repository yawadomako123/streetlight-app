import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius } from '../theme';
import { Button, Card, Label, SectionTitle, Toggle } from './ui';
import type { SyncConfig } from '../types';

export interface AutomationEdit {
  manual_override: boolean;
  target_brightness_pct: number; // 0–100 (converted to PWM by the caller)
  schedule_start: string;        // 'HH:MM' or ''
  schedule_end: string;          // 'HH:MM' or ''
  ldr_threshold: string;         // '' = use global
  auto_dim_delay: number;        // minutes, 0 = off
}

function fromConfig(c: SyncConfig): AutomationEdit {
  return {
    manual_override: c.manual_override,
    target_brightness_pct:
      c.target_brightness != null ? Math.round((c.target_brightness / 255) * 100) : 100,
    schedule_start: '',
    schedule_end: '',
    ldr_threshold: c.ldr_threshold != null ? String(c.ldr_threshold) : '',
    auto_dim_delay: c.auto_dim_delay ?? 0,
  };
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : null]}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

export function AutomationPanel({
  config,
  locked,
  onLogin,
  onApply,
  applying,
}: {
  config: SyncConfig;
  /** When true, controls are disabled and a Login button is shown (backend mode, not admin). */
  locked: boolean;
  onLogin?: () => void;
  onApply: (edit: AutomationEdit) => void;
  applying?: boolean;
}) {
  const [edit, setEdit] = useState<AutomationEdit>(() => fromConfig(config));
  const patch = (p: Partial<AutomationEdit>) => setEdit((e) => ({ ...e, ...p }));

  if (locked) {
    return (
      <Card>
        <SectionTitle>Automation &amp; Control</SectionTitle>
        <Text style={styles.lockedText}>
          Sign in as an admin to override brightness, set a schedule, and tune the sensors.
        </Text>
        {onLogin && <Button title="Admin sign in" onPress={onLogin} />}
      </Card>
    );
  }

  const brightChips = [
    { label: 'Off', pct: 0 },
    { label: 'Dim', pct: 20 },
    { label: 'Half', pct: 50 },
    { label: 'Full', pct: 100 },
  ];
  const dimChips = [0, 1, 5, 15, 30];

  return (
    <Card style={{ gap: 20 }}>
      <SectionTitle>Automation &amp; Control</SectionTitle>

      {/* Brightness override */}
      <View>
        <View style={styles.rowBetween}>
          <View style={{ flexShrink: 1, paddingRight: 12 }}>
            <Text style={styles.h4}>Brightness Override</Text>
            <Text style={styles.desc}>Force the LED to a fixed level, ignoring sensors.</Text>
          </View>
          <Toggle
            value={edit.manual_override}
            onChange={(v) => patch({ manual_override: v })}
          />
        </View>
        {edit.manual_override && (
          <View style={styles.chipRow}>
            {brightChips.map((c) => (
              <Chip
                key={c.label}
                label={`${c.label} ${c.pct}%`}
                active={edit.target_brightness_pct === c.pct}
                onPress={() => patch({ target_brightness_pct: c.pct })}
              />
            ))}
          </View>
        )}
      </View>

      {/* Schedule */}
      <View>
        <Text style={styles.h4}>Active Schedule</Text>
        <Text style={styles.desc}>
          When the node may run. Leave blank for 24/7. Overnight ranges OK (e.g. 18:00 → 06:00).
        </Text>
        <View style={styles.timeRow}>
          <View style={styles.timeCol}>
            <Label>On from</Label>
            <TextInput
              value={edit.schedule_start}
              onChangeText={(t) => patch({ schedule_start: t })}
              placeholder="18:00"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View style={styles.timeCol}>
            <Label>Off at</Label>
            <TextInput
              value={edit.schedule_end}
              onChangeText={(t) => patch({ schedule_end: t })}
              placeholder="06:00"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </View>
      </View>

      {/* LDR threshold */}
      <View>
        <Text style={styles.h4}>LDR Sensitivity</Text>
        <Text style={styles.desc}>Day/night threshold for this node. Blank = use global.</Text>
        <TextInput
          value={edit.ldr_threshold}
          onChangeText={(t) => patch({ ldr_threshold: t.replace(/[^0-9]/g, '') })}
          placeholder="e.g. 150"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          keyboardType="number-pad"
        />
      </View>

      {/* Auto-dim */}
      <View>
        <View style={styles.rowBetween}>
          <Text style={styles.h4}>Auto-Dim Timer</Text>
          <Text style={styles.amberVal}>
            {edit.auto_dim_delay === 0 ? 'Off' : `${edit.auto_dim_delay} min`}
          </Text>
        </View>
        <Text style={styles.desc}>Stay at baseline for N minutes after motion, then off.</Text>
        <View style={styles.chipRow}>
          {dimChips.map((m) => (
            <Chip
              key={m}
              label={m === 0 ? 'Off' : `${m}m`}
              active={edit.auto_dim_delay === m}
              onPress={() => patch({ auto_dim_delay: m })}
            />
          ))}
        </View>
      </View>

      <Button title="Apply" onPress={() => onApply(edit)} loading={applying} />
    </Card>
  );
}

const styles = StyleSheet.create({
  lockedText: { color: colors.textMuted, fontSize: 13, marginVertical: 10, lineHeight: 19 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  h4: { color: colors.white, fontWeight: '700', fontSize: 14 },
  desc: { color: colors.textMuted, fontSize: 12, marginTop: 2, marginBottom: 8, lineHeight: 17 },
  amberVal: { color: colors.amber, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: colors.amberDim, borderColor: colors.amberBorder },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.amber },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeCol: { flex: 1, gap: 6 },
  input: {
    backgroundColor: colors.inputBg,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.white,
    fontSize: 14,
  },
});
