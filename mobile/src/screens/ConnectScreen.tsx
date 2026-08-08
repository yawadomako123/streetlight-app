import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';
import { bridge } from '../bluetooth/BridgeService';
import type { BtDevice } from '../bluetooth';
import { useBridge } from '../hooks/useBridge';
import type { RootStackParamList } from '../../App';
import { USE_MOCK_BT, CONNECTION_MODE } from '../config';

type Props = NativeStackScreenProps<RootStackParamList, 'Connect'>;

export function ConnectScreen({ navigation }: Props) {
  const snap = useBridge();
  const [onboardingStep, setOnboardingStep] = useState<0 | 1 | 2 | 3>(0); // 0: Splash, 1: Onboarding 1, 2: Onboarding 2, 3: Connect Devices
  const [devices, setDevices] = useState<BtDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-progress from Splash screen (Step 0) to Onboarding (Step 1)
  useEffect(() => {
    if (onboardingStep === 0) {
      const timer = setTimeout(() => {
        setOnboardingStep(1);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [onboardingStep]);

  const scan = useCallback(async () => {
    setError(null);
    setScanning(true);
    try {
      const list = await bridge.listDevices();
      setDevices(list);
      if (list.length === 0) {
        setError('No paired devices. Pair your HC-05 in Android Bluetooth settings first (PIN 1234 or 0000), then scan again.');
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setScanning(false);
    }
  }, []);

  // Auto-scan if user reaches the connect screen (Bluetooth mode only —
  // backend/WiFi mode has nothing to scan and shouldn't prompt for BT permission).
  useEffect(() => {
    if (onboardingStep === 3 && CONNECTION_MODE === 'bluetooth') {
      scan();
    }
  }, [onboardingStep, scan]);

  const connect = useCallback(
    async (device: BtDevice) => {
      setError(null);
      setConnectingId(device.id);
      try {
        await bridge.connect(device);
        navigation.navigate('Dashboard');
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setConnectingId(null);
      }
    },
    [navigation],
  );

  // Backend/WiFi mode (ESP32): no device to scan — just start reading from the backend.
  const connectBackend = useCallback(async () => {
    setError(null);
    setConnectingId('backend');
    try {
      await bridge.connectBackend();
      navigation.navigate('Dashboard');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setConnectingId(null);
    }
  }, [navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* ── STEP 0: SPLASH SCREEN ── */}
      {onboardingStep === 0 && (
        <View style={styles.splashContainer}>
          <View style={styles.splashLogoContainer}>
            <Text style={styles.splashLogo}>💡</Text>
          </View>
          <Text style={styles.splashTitle}>StreetLight <Text style={{ color: colors.amber }}>AI</Text></Text>
          <Text style={styles.splashSubtitle}>Adaptive lighting, always awake</Text>
          
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarFill} />
          </View>
          <Text style={styles.progressText}>Checking session...</Text>
        </View>
      )}

      {/* ── STEP 1: ONBOARDING STEP 1 ── */}
      {onboardingStep === 1 && (
        <View style={styles.onboardContainer}>
          <View style={styles.onboardHeader}>
            <Pressable onPress={() => setOnboardingStep(3)}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          </View>

          <View style={styles.illustrationContainer}>
            <View style={styles.pillsRow}>
              <View style={styles.pill}><Text style={styles.pillText}>☀ LDR</Text></View>
              <View style={styles.pill}><Text style={styles.pillText}>📶 PIR</Text></View>
              <View style={styles.pill}><Text style={styles.pillText}>⚙ PWM</Text></View>
            </View>
            
            {/* Bar chart illustration mock */}
            <View style={styles.chartMock}>
              <View style={[styles.chartBar, { height: 24 }]} />
              <View style={[styles.chartBar, { height: 48 }]} />
              <View style={[styles.chartBar, { height: 80, backgroundColor: colors.amber }]} />
              <View style={[styles.chartBar, { height: 60 }]} />
              <View style={[styles.chartBar, { height: 36 }]} />
              <View style={[styles.chartBar, { height: 18 }]} />
            </View>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.onboardTitle}>Light that reads the street</Text>
            <Text style={styles.onboardDesc}>
              An LDR reads ambient light, a PIR sensor catches movement, and PWM dims each lamp to exactly what the moment needs.
            </Text>
          </View>

          {/* Navigation Controls */}
          <View style={styles.controlsRow}>
            <View style={styles.indicatorContainer}>
              <View style={[styles.indicatorDot, styles.indicatorDotActive]} />
              <View style={styles.indicatorDot} />
            </View>
            
            <Pressable onPress={() => setOnboardingStep(2)} style={styles.nextBtn}>
              <Text style={styles.nextBtnText}>Next  ➔</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── STEP 2: ONBOARDING STEP 2 ── */}
      {onboardingStep === 2 && (
        <View style={styles.onboardContainer}>
          <View style={styles.onboardHeader}>
            <Pressable onPress={() => setOnboardingStep(3)}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          </View>

          <View style={styles.illustrationContainer}>
            <View style={styles.zoneListMock}>
              <View style={styles.zoneCardMock}>
                <View style={[styles.statusDot, { backgroundColor: colors.green }]} />
                <Text style={styles.zoneCardText}>Zone A — Main Street</Text>
                <Text style={styles.zoneCardVal}>92%</Text>
              </View>
              <View style={styles.zoneCardMock}>
                <View style={[styles.statusDot, { backgroundColor: colors.green }]} />
                <Text style={styles.zoneCardText}>Zone B — Park Lane</Text>
                <Text style={styles.zoneCardVal}>34%</Text>
              </View>
              <View style={[styles.zoneCardMock, { opacity: 0.6 }]}>
                <View style={[styles.statusDot, { backgroundColor: colors.red }]} />
                <Text style={styles.zoneCardText}>Zone C — Riverside</Text>
                <Text style={styles.zoneCardVal}>--</Text>
              </View>
            </View>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.onboardTitle}>Every zone, live in your hand</Text>
            <Text style={styles.onboardDesc}>
              Sign in to watch brightness, motion, and uptime as they happen — and to take manual control when you need it.
            </Text>
          </View>

          <View style={styles.controlsRow}>
            <View style={styles.indicatorContainer}>
              <View style={styles.indicatorDot} />
              <View style={[styles.indicatorDot, styles.indicatorDotActive]} />
            </View>
            
            <Pressable onPress={() => setOnboardingStep(3)} style={styles.nextBtn}>
              <Text style={styles.nextBtnText}>Get started  ➔</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── STEP 3: CONNECT SCREEN ── */}
      {onboardingStep === 3 && (
        <ScrollView contentContainerStyle={styles.connectContent}>
          <View style={styles.brandRow}>
            <View style={styles.brandLogo}>
              <Text style={{ fontSize: 20 }}>💡</Text>
            </View>
            <View>
              <Text style={styles.connectTitle}>StreetLight <Text style={{ color: colors.amber }}>AI</Text></Text>
              <Text style={styles.connectSubtitle}>
                {CONNECTION_MODE === 'backend' ? 'Connect over WiFi' : 'Connect over Bluetooth'}
              </Text>
            </View>
          </View>

          {/* WiFi / Backend connect (ESP32) */}
          {CONNECTION_MODE === 'backend' && (
            <View style={styles.glassCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Connect over WiFi</Text>
                <Text style={styles.cardSub}>ESP32 · Backend</Text>
              </View>
              <Text style={styles.emptyText}>
                Your ESP32 sends readings to the backend over WiFi. Make sure the backend is
                running and this phone can reach it, then connect.
              </Text>
              <Pressable
                onPress={connectBackend}
                disabled={connectingId !== null}
                style={({ pressed }) => [styles.scanBtn, pressed && { opacity: 0.8 }]}
              >
                {connectingId === 'backend' ? (
                  <ActivityIndicator color="#0B1530" />
                ) : (
                  <Text style={styles.scanBtnText}>Connect to system</Text>
                )}
              </Pressable>
            </View>
          )}

          {/* Device List Card (Bluetooth mode) */}
          {CONNECTION_MODE === 'bluetooth' && (
          <View style={styles.glassCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Paired devices</Text>
              <Text style={styles.cardSub}>{USE_MOCK_BT ? 'Offline / Mock Mode' : 'Bluetooth Classic'}</Text>
            </View>

            {devices.map((d) => (
              <Pressable
                key={d.id}
                onPress={() => connect(d)}
                disabled={connectingId !== null}
                style={({ pressed }) => [
                  styles.deviceRow,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceName}>{d.name}</Text>
                  <Text style={styles.deviceId}>{d.id}</Text>
                </View>
                {connectingId === d.id ? (
                  <ActivityIndicator color={colors.amber} />
                ) : (
                  <Text style={styles.deviceArrow}>➔</Text>
                )}
              </Pressable>
            ))}

            {devices.length === 0 && !scanning && (
              <Text style={styles.emptyText}>Tap Scan to discover paired Bluetooth devices.</Text>
            )}

            <Pressable
              onPress={scan}
              disabled={scanning}
              style={({ pressed }) => [
                styles.scanBtn,
                pressed && { opacity: 0.8 },
              ]}
            >
              {scanning ? (
                <ActivityIndicator color="#0B1530" />
              ) : (
                <Text style={styles.scanBtnText}>Scan for devices</Text>
              )}
            </Pressable>
          </View>
          )}

          {error && (
            <View style={[styles.glassCard, { borderColor: colors.red + '55' }]}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Text style={styles.helpText}>
            Tip: The HC-05 must be paired in your phone's Bluetooth settings first. PIN is usually 1234 or 0000.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.nightStart },
  
  // Splash styles
  splashContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 12,
  },
  splashLogoContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: colors.amberDim,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.amberBorder,
    marginBottom: 16,
  },
  splashLogo: { fontSize: 36 },
  splashTitle: { color: colors.white, fontSize: 26, fontWeight: '800' },
  splashSubtitle: { color: colors.textMuted, fontSize: 13, marginBottom: 40 },
  progressBarContainer: {
    width: 140,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    width: '60%',
    height: '100%',
    backgroundColor: colors.amber,
  },
  progressText: { color: colors.textFaint, fontSize: 11, marginTop: 8 },

  // Onboarding screens styles
  onboardContainer: {
    flex: 1,
    paddingHorizontal: 22,
    justifyContent: 'space-between',
    paddingBottom: 40,
  },
  onboardHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: 16,
  },
  skipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  illustrationContainer: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.nightEnd,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 20,
  },
  pillsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  pillText: { color: colors.text, fontSize: 11, fontWeight: '600' },
  chartMock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    height: 100,
  },
  chartBar: {
    width: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
  },
  infoBox: { gap: 8 },
  onboardTitle: { color: colors.white, fontSize: 22, fontWeight: '800' },
  onboardDesc: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
  },
  indicatorContainer: { flexDirection: 'row', gap: 6 },
  indicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  indicatorDotActive: {
    backgroundColor: colors.amber,
    width: 16,
  },
  nextBtn: {
    backgroundColor: colors.amber,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
    shadowColor: colors.amber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  nextBtnText: { color: '#0B1530', fontSize: 13, fontWeight: 'bold' },

  // Onboarding Step 2 mocks
  zoneListMock: { width: '100%', gap: 8 },
  zoneCardMock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  zoneCardText: { color: colors.text, fontSize: 12, flex: 1, marginLeft: 10 },
  zoneCardVal: { color: colors.white, fontSize: 12, fontWeight: 'bold' },

  // Connect Screen Step 3 styles
  connectContent: { paddingHorizontal: 22, paddingBottom: 40, paddingTop: 16, gap: 20 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  brandLogo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.amberDim,
    borderWidth: 1.5,
    borderColor: colors.amberBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectTitle: { color: colors.white, fontSize: 20, fontWeight: '800' },
  connectSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  glassCard: {
    backgroundColor: colors.nightEnd,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 18,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    paddingBottom: 10,
    marginBottom: 4,
  },
  cardTitle: { color: colors.white, fontSize: 15, fontWeight: '600' },
  cardSub: { color: colors.textFaint, fontSize: 11 },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(11,21,48,0.7)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  deviceName: { color: colors.white, fontSize: 14, fontWeight: '600' },
  deviceId: { color: colors.textFaint, fontSize: 10, marginTop: 2 },
  deviceArrow: { color: colors.amber, fontSize: 14 },
  emptyText: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginVertical: 10 },
  scanBtn: {
    backgroundColor: colors.amber,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  scanBtnText: { color: '#0B1530', fontSize: 14, fontWeight: 'bold' },
  errorText: { color: colors.red, fontSize: 12, lineHeight: 18 },
  helpText: { color: colors.textFaint, fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
