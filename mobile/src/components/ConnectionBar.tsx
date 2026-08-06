import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';
import { Badge, Button } from './ui';
import type { BridgeSnapshot } from '../bluetooth/BridgeService';
import { RELAY_TO_BACKEND } from '../config';

export function ConnectionBar({
  snap,
  onDisconnect,
}: {
  snap: BridgeSnapshot;
  onDisconnect: () => void;
}) {
  const online = snap.connection === 'connected';
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.left}>
          <View
            style={[
              styles.dot,
              { backgroundColor: online ? colors.green : colors.red },
            ]}
          />
          <View>
            <Text style={styles.name}>
              {snap.deviceName ?? 'No device'}
            </Text>
            <Text style={styles.sub}>
              {online ? 'Connected' : snap.connection} · {snap.transportKind}
            </Text>
          </View>
        </View>
        {online && (
          <Button title="Disconnect" tone="danger" onPress={onDisconnect} />
        )}
      </View>

      {online && RELAY_TO_BACKEND && (
        <View style={styles.relayRow}>
          <Badge
            text={
              snap.relayOk === true
                ? 'Backend synced'
                : snap.relayOk === false
                ? 'Backend offline'
                : 'Backend pending'
            }
            tone={snap.relayOk === true ? 'green' : snap.relayOk === false ? 'red' : 'muted'}
          />
        </View>
      )}

      {snap.error && <Text style={styles.error}>{snap.error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.nightStart + 'cc',
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    gap: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { color: colors.white, fontWeight: '700', fontSize: 15 },
  sub: { color: colors.textMuted, fontSize: 12, textTransform: 'capitalize' },
  relayRow: { flexDirection: 'row' },
  error: { color: colors.red, fontSize: 12 },
});
