import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { Bar, Card, Label } from './ui';
import type { Telemetry, SyncConfig } from '../types';

export function TelemetryCard({
  latest,
  config,
}: {
  latest: Telemetry | null;
  config: SyncConfig;
}) {
  if (!latest) {
    return (
      <Card>
        <Text style={styles.waiting}>Waiting for telemetry…</Text>
      </Card>
    );
  }

  const brightnessPct = Math.round((latest.ledBrightness / 255) * 100);
  const threshold = config.ldr_threshold ?? 150;
  const isDay = latest.lightLevel > threshold;
  const ledColor =
    brightnessPct > 80 ? '#fbbf24' : brightnessPct > 20 ? '#f59e0b' : '#4b5563';

  const secondsAgo = Math.floor((Date.now() - latest.at) / 1000);
  const seen =
    secondsAgo < 2 ? 'Just now' : secondsAgo < 60 ? `${secondsAgo}s ago` : `${Math.floor(secondsAgo / 60)}m ago`;

  return (
    <Card>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.sunWrap}>
          <View
            style={[
              styles.sun,
              {
                backgroundColor: brightnessPct > 0 ? colors.amber + '33' : 'rgba(255,255,255,0.04)',
                borderColor: brightnessPct > 0 ? colors.amberBorder : colors.cardBorder,
              },
            ]}
          >
            <Text style={{ fontSize: 24 }}>{isDay ? '☀️' : '🌙'}</Text>
          </View>
          <View>
            <Text style={styles.title}>Street Light Node</Text>
            <Text style={styles.sub}>
              {isDay ? 'Day — lights off' : 'Night — armed'} · {seen}
            </Text>
          </View>
        </View>
        {config.manual_override && (
          <Text style={styles.override}>⚡ OVERRIDE</Text>
        )}
      </View>

      {/* LED brightness */}
      <View style={styles.metric}>
        <View style={styles.metricHead}>
          <Label>LED Brightness</Label>
          <Text style={styles.value}>{brightnessPct}%</Text>
        </View>
        <Bar value={latest.ledBrightness} max={255} color={ledColor} />
      </View>

      {/* Ambient light */}
      <View style={styles.metric}>
        <View style={styles.metricHead}>
          <Label>Ambient Light</Label>
          <Text style={styles.value}>{latest.lightLevel}</Text>
        </View>
        <Bar value={latest.lightLevel} max={1023} color={colors.blue} />
        <Text style={styles.hint}>
          {isDay ? `Above threshold (${threshold})` : `Below threshold (${threshold})`}
        </Text>
      </View>

      {/* Motion */}
      <View style={styles.motionRow}>
        <Label>Motion</Label>
        <View style={styles.motionState}>
          <View
            style={[
              styles.motionDot,
              { backgroundColor: latest.motionDetected ? colors.amber : colors.textFaint },
            ]}
          />
          <Text
            style={[
              styles.motionText,
              { color: latest.motionDetected ? colors.amber : colors.textFaint },
            ]}
          >
            {latest.motionDetected ? 'DETECTED' : 'CLEAR'}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  waiting: { color: colors.amber, textAlign: 'center', paddingVertical: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  sunWrap: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  sun: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.white, fontWeight: '700', fontSize: 16 },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  override: { color: colors.amber, fontWeight: '800', fontSize: 11 },
  metric: { marginBottom: 16 },
  metricHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  value: { color: colors.white, fontWeight: '700', fontSize: 14 },
  hint: { color: colors.textFaint, fontSize: 10, marginTop: 6 },
  motionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  motionState: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  motionDot: { width: 12, height: 12, borderRadius: 6 },
  motionText: { fontWeight: '800', fontSize: 16 },
});
