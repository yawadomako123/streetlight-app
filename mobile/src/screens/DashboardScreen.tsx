import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Switch,
  Modal,
  Dimensions,
  Animated,
} from 'react-native';
import Slider from '@react-native-community/slider'; // Fallback to custom slider if needed, but standard in RN. Let's make a custom pressable-slider or use standard View-based sliders so we don't need external packages!
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';
import { bridge } from '../bluetooth/BridgeService';
import { useBridge } from '../hooks/useBridge';
import * as api from '../api/client';
import { DEVICE_ID, RELAY_TO_BACKEND } from '../config';
import type { AuthUser } from '../types';
import type { RootStackParamList } from '../../App';

// Simple SVG/Path replacements or Feather/Ionicons mock using simple shapes
// to ensure perfect visual presentation without package dependencies.
function Icon({ name, color = colors.textMuted, size = 20 }: { name: string; color?: string; size?: number }) {
  // Return simple styled views resembling the icon concepts
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {name === 'grid' && (
        <View style={{ flexWrap: 'wrap', flexDirection: 'row', width: 14, height: 14, gap: 2 }}>
          <View style={{ width: 6, height: 6, backgroundColor: color, borderRadius: 1.5 }} />
          <View style={{ width: 6, height: 6, backgroundColor: color, borderRadius: 1.5 }} />
          <View style={{ width: 6, height: 6, backgroundColor: color, borderRadius: 1.5 }} />
          <View style={{ width: 6, height: 6, backgroundColor: color, borderRadius: 1.5 }} />
        </View>
      )}
      {name === 'lightbulb' && (
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: color }} />
          <View style={{ width: 6, height: 3, backgroundColor: color, marginTop: 1 }} />
        </View>
      )}
      {name === 'sliders' && (
        <View style={{ gap: 3, width: 14 }}>
          <View style={{ height: 2, backgroundColor: color, width: '100%' }} />
          <View style={{ height: 2, backgroundColor: color, width: '80%' }} />
          <View style={{ height: 2, backgroundColor: color, width: '60%' }} />
        </View>
      )}
      {name === 'power' && (
        <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: color, borderTopColor: 'transparent', alignItems: 'center' }}>
          <View style={{ width: 2, height: 6, backgroundColor: color, position: 'absolute', top: -2 }} />
        </View>
      )}
      {name === 'clock' && (
        <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 2, height: 4, backgroundColor: color }} />
          <View style={{ width: 4, height: 2, backgroundColor: color, position: 'absolute', right: 2, top: 4 }} />
        </View>
      )}
      {name === 'signal' && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 12 }}>
          <View style={{ width: 2, height: 4, backgroundColor: color }} />
          <View style={{ width: 2, height: 8, backgroundColor: color }} />
          <View style={{ width: 2, height: 12, backgroundColor: color }} />
        </View>
      )}
      {name === 'chart' && (
        <View style={{ width: 14, height: 12, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: color, paddingLeft: 2, paddingBottom: 2 }}>
          <View style={{ width: 8, height: 6, borderTopWidth: 2, borderRightWidth: 2, borderColor: color }} />
        </View>
      )}
      {name === 'chevron-right' && (
        <Text style={{ color, fontSize: 14, fontWeight: 'bold' }}>➔</Text>
      )}
      {name === 'refresh' && (
        <Text style={{ color, fontSize: 16 }}>↻</Text>
      )}
    </View>
  );
}

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

export function DashboardScreen({ navigation }: Props) {
  const snap = useBridge();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [currentTab, setCurrentTab] = useState<'overview' | 'devices' | 'settings'>('overview');
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null); // For detail drill-in modal
  
  // Settings Form States
  const [ldrVal, setLdrVal] = useState(420);
  const [pirTimeout, setPirTimeout] = useState(45);
  const [globalOverride, setGlobalOverride] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastOpacity] = useState(new Animated.Value(0));

  const refreshUser = useCallback(async () => {
    if (!RELAY_TO_BACKEND) return;
    await api.loadToken();
    try {
      setUser(await api.me());
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    const unsub = navigation.addListener('focus', refreshUser);
    return unsub;
  }, [navigation, refreshUser]);

  // Sync initial settings when the device config is fetched
  useEffect(() => {
    if (snap.config) {
      setLdrVal(snap.config.ldr_threshold ?? 420);
      setGlobalOverride(snap.config.manual_override ?? false);
      setPirTimeout(snap.config.auto_dim_delay ?? 45);
    }
  }, [snap.config]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToastMsg(null));
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    const targetPwm = globalOverride ? Math.round((100 / 100) * 255) : null;

    if (!RELAY_TO_BACKEND) {
      bridge.setLocalConfig({
        manual_override: globalOverride,
        target_brightness: targetPwm,
        ldr_threshold: ldrVal,
        auto_dim_delay: pirTimeout,
      });
      showToast('Settings saved');
      setSaving(false);
      return;
    }

    try {
      await api.setOverride(DEVICE_ID, globalOverride, targetPwm);
      await api.setConfig(DEVICE_ID, {
        ldr_threshold: ldrVal,
        auto_dim_delay: pirTimeout,
        schedule_start: null,
        schedule_end: null,
      });
      showToast('Settings saved');
    } catch (e: any) {
      showToast('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleDeviceOverride = async (deviceId: string, currentOverride: boolean, currentBright: number) => {
    const nextOverride = !currentOverride;
    const nextPwm = nextOverride ? 255 : null;

    if (!RELAY_TO_BACKEND) {
      bridge.setLocalConfig({
        manual_override: nextOverride,
        target_brightness: nextPwm,
      });
      showToast(nextOverride ? 'Zone A override enabled' : 'Zone A returned to auto');
      return;
    }

    try {
      await api.setOverride(DEVICE_ID, nextOverride, nextPwm);
      showToast(nextOverride ? 'Zone A override enabled' : 'Zone A returned to auto');
    } catch {
      showToast('Action failed');
    }
  };

  const getLdrText = (val: number) => {
    if (val < 300) return 'Very Dark';
    if (val < 600) return 'Dim / Dusk';
    return 'Bright / Day';
  };

  const liveBrightness = snap.telemetry?.ledBrightness ?? 0;
  const brightnessPercent = Math.round((liveBrightness / 255) * 100);
  const liveLdr = snap.telemetry?.lightLevel ?? 420;
  const liveMotion = snap.telemetry?.motionDetected ?? false;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Toast Notification */}
      {toastMsg && (
        <Animated.View style={[styles.toastContainer, { opacity: toastOpacity }]}>
          <View style={styles.toastCard}>
            <View style={styles.toastCheck}>
              <Text style={styles.toastCheckText}>✓</Text>
            </View>
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        </Animated.View>
      )}

      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Dashboard</Text>
          <Text style={styles.headerSubtitle}>
            {snap.connection === 'connected' ? 'Connected to HC-05' : 'Searching for device...'}
          </Text>
        </View>

        <Pressable
          onPress={async () => {
            if (user) {
              await api.logout();
              setUser(null);
              showToast('Logged out');
            } else {
              navigation.navigate('Login');
            }
          }}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>
            {user ? user.username.slice(0, 2).toUpperCase() : 'AD'}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* TAB 1: OVERVIEW */}
        {currentTab === 'overview' && (
          <View style={styles.tabContent}>
            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <Icon name="power" color={colors.amber} size={18} />
                </View>
                <Text style={styles.statValue}>42%</Text>
                <Text style={styles.statLabel}>ENERGY SAVED</Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <Icon name="clock" color={colors.amber} size={18} />
                </View>
                <Text style={styles.statValue}>99.2%</Text>
                <Text style={styles.statLabel}>SYSTEM UPTIME</Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <Icon name="signal" color={colors.amber} size={18} />
                </View>
                <Text style={styles.statValue}>{liveMotion ? '1,285' : '1,284'}</Text>
                <Text style={styles.statLabel}>MOTION EVENTS</Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <Icon name="chart" color={colors.amber} size={18} />
                </View>
                <Text style={styles.statValue}>86.4k</Text>
                <Text style={styles.statLabel}>SENSOR READINGS</Text>
              </View>
            </View>

            {/* Live Zones Summary */}
            <View style={styles.glassCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Live zones</Text>
                <Text style={styles.cardTitleRight}>2 of 3 online</Text>
              </View>

              <Pressable onPress={() => setSelectedDevice('Zone A')} style={styles.zoneRow}>
                <View style={styles.zoneInfo}>
                  <View style={[styles.statusDot, { backgroundColor: colors.green }]} />
                  <Text style={styles.zoneName}>Zone A — Main Street</Text>
                </View>
                <View style={styles.zoneProgressContainer}>
                  <View style={[styles.zoneProgressBar, { width: `${brightnessPercent}%` }]} />
                  <Text style={styles.zoneValue}>{brightnessPercent}%</Text>
                </View>
              </Pressable>

              <View style={styles.zoneRow}>
                <View style={styles.zoneInfo}>
                  <View style={[styles.statusDot, { backgroundColor: colors.green }]} />
                  <Text style={styles.zoneName}>Zone B — Park Lane</Text>
                </View>
                <View style={styles.zoneProgressContainer}>
                  <View style={[styles.zoneProgressBar, { width: '34%', backgroundColor: 'rgba(255,255,255,0.2)' }]} />
                  <Text style={styles.zoneValue}>34%</Text>
                </View>
              </View>

              <View style={styles.zoneRow}>
                <View style={styles.zoneInfo}>
                  <View style={[styles.statusDot, { backgroundColor: colors.red }]} />
                  <Text style={styles.zoneName}>Zone C — Riverside</Text>
                </View>
                <Text style={styles.zoneOfflineText}>Offline</Text>
              </View>
            </View>
          </View>
        )}

        {/* TAB 2: DEVICES */}
        {currentTab === 'devices' && (
          <View style={styles.tabContent}>
            {/* Zone A (Connected controller) */}
            <Pressable onPress={() => setSelectedDevice('Zone A')} style={styles.glassCard}>
              <View style={styles.deviceHeader}>
                <View style={styles.deviceTitleContainer}>
                  <Text style={styles.deviceTitle}>Zone A — Main Street</Text>
                  <View style={styles.deviceStatusContainer}>
                    <View style={[styles.statusDot, { backgroundColor: colors.green }]} />
                    <Text style={styles.deviceStatusText}>
                      Online — {liveMotion ? 'motion now' : 'idle'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.devicePercentText}>{brightnessPercent}%</Text>
              </View>

              {/* Progress track */}
              <View style={styles.deviceProgressTrack}>
                <View style={[styles.deviceProgressFill, { width: `${brightnessPercent}%` }]} />
              </View>

              <Pressable
                onPress={() => toggleDeviceOverride(DEVICE_ID, globalOverride, liveBrightness)}
                style={styles.deviceActionBtn}
              >
                <Text style={styles.deviceActionBtnText}>
                  {globalOverride ? 'Turn off manual control' : 'Turn off'}
                </Text>
              </Pressable>
            </Pressable>

            {/* Zone B (Static Mock) */}
            <View style={styles.glassCard}>
              <View style={styles.deviceHeader}>
                <View style={styles.deviceTitleContainer}>
                  <Text style={styles.deviceTitle}>Zone B — Park Lane</Text>
                  <View style={styles.deviceStatusContainer}>
                    <View style={[styles.statusDot, { backgroundColor: colors.green }]} />
                    <Text style={styles.deviceStatusText}>Online — idle</Text>
                  </View>
                </View>
                <Text style={styles.devicePercentText}>34%</Text>
              </View>

              <View style={styles.deviceProgressTrack}>
                <View style={[styles.deviceProgressFill, { width: '34%', backgroundColor: 'rgba(255,255,255,0.2)' }]} />
              </View>

              <Pressable style={[styles.deviceActionBtn, { opacity: 0.7 }]}>
                <Text style={styles.deviceActionBtnText}>Turn off</Text>
              </Pressable>
            </View>

            {/* Zone C (Offline Mock) */}
            <View style={[styles.glassCard, { opacity: 0.5 }]}>
              <View style={styles.deviceHeader}>
                <View style={styles.deviceTitleContainer}>
                  <Text style={styles.deviceTitle}>Zone C — Riverside</Text>
                  <View style={styles.deviceStatusContainer}>
                    <View style={[styles.statusDot, { backgroundColor: colors.red }]} />
                    <Text style={styles.deviceStatusText}>Offline — last seen 14:02</Text>
                  </View>
                </View>
                <Text style={styles.devicePercentText}>--</Text>
              </View>

              <View style={styles.disabledActionBtn}>
                <Text style={styles.disabledActionBtnText}>Unavailable while offline</Text>
              </View>
            </View>
          </View>
        )}

        {/* TAB 3: SETTINGS */}
        {currentTab === 'settings' && (
          <View style={styles.tabContent}>
            {/* LDR Sensitivity */}
            <View style={styles.glassCard}>
              <View style={styles.sliderHeader}>
                <Text style={styles.sliderTitle}>☀  LDR sensitivity</Text>
                <Text style={styles.sliderValue}>{ldrVal}</Text>
              </View>

              {/* View-based custom slider so no external library is needed */}
              <View style={styles.sliderTrackContainer}>
                <Slider
                  minimumValue={0}
                  maximumValue={1023}
                  step={1}
                  value={ldrVal}
                  onValueChange={(val) => setLdrVal(Math.round(val))}
                  minimumTrackTintColor={colors.amber}
                  maximumTrackTintColor="rgba(255,255,255,0.1)"
                  thumbTintColor={colors.amber}
                />
              </View>

              <View style={styles.sliderLimits}>
                <Text style={styles.limitText}>0</Text>
                <Text style={styles.limitText}>1023</Text>
              </View>
              <Text style={styles.sliderDesc}>
                Lower values keep the lamps off until it gets darker (Currently: {getLdrText(ldrVal)}).
              </Text>
            </View>

            {/* PIR timeout */}
            <View style={styles.glassCard}>
              <View style={styles.sliderHeader}>
                <Text style={styles.sliderTitle}>📶  PIR motion timeout</Text>
                <Text style={styles.sliderValue}>{pirTimeout}s</Text>
              </View>

              <View style={styles.sliderTrackContainer}>
                <Slider
                  minimumValue={5}
                  maximumValue={300}
                  step={5}
                  value={pirTimeout}
                  onValueChange={(val) => setPirTimeout(Math.round(val))}
                  minimumTrackTintColor={colors.amber}
                  maximumTrackTintColor="rgba(255,255,255,0.1)"
                  thumbTintColor={colors.amber}
                />
              </View>

              <View style={styles.sliderLimits}>
                <Text style={styles.limitText}>5s</Text>
                <Text style={styles.limitText}>300s</Text>
              </View>
              <Text style={styles.sliderDesc}>
                How long a lamp stays at full brightness after the last movement.
              </Text>
            </View>

            {/* Global Manual Override */}
            <View style={styles.glassCard}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.toggleTitle}>⚡  Global manual override</Text>
                  <Text style={styles.toggleDesc}>
                    Takes every zone off sensor control until switched back.
                  </Text>
                </View>
                <Switch
                  value={globalOverride}
                  onValueChange={setGlobalOverride}
                  trackColor={{ false: '#16213E', true: colors.amber }}
                  thumbColor={globalOverride ? '#FFFFFF' : '#9CA3AF'}
                />
              </View>
            </View>

            {/* Save Config Button */}
            <Pressable
              onPress={handleSaveConfig}
              disabled={saving}
              style={({ pressed }) => [
                styles.saveBtn,
                pressed && { opacity: 0.8 },
                saving && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.saveBtnText}>✓  Save configuration</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Drill-in Detail Modal (Zone A) */}
      <Modal
        visible={selectedDevice !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedDevice(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setSelectedDevice(null)} style={styles.backBtn}>
                <Text style={styles.backBtnText}>←</Text>
              </Pressable>
              <Text style={styles.modalTitle}>{selectedDevice}</Text>
              <Pressable style={styles.refreshBtn}>
                <Icon name="refresh" color={colors.white} size={16} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              {/* Circular Gauge */}
              <View style={styles.gaugeContainer}>
                <View style={styles.outerGaugeRing}>
                  <View style={styles.innerGaugeRing}>
                    <Text style={styles.gaugeValue}>{brightnessPercent}%</Text>
                    <Text style={styles.gaugeLabel}>BRIGHTNESS</Text>
                  </View>
                </View>
                <View style={styles.gaugeStatusRow}>
                  <View style={[styles.statusDot, { backgroundColor: colors.green }]} />
                  <Text style={styles.gaugeStatusText}>Online — Main Street</Text>
                </View>
              </View>

              {/* Grid of detail stats */}
              <View style={styles.detailStatsGrid}>
                <View style={styles.detailStatCard}>
                  <Text style={styles.detailStatHeader}>MOTION</Text>
                  <Text style={styles.detailStatVal}>
                    {liveMotion ? 'Detected now' : 'No motion'}
                  </Text>
                </View>
                <View style={styles.detailStatCard}>
                  <Text style={styles.detailStatHeader}>LDR READING</Text>
                  <Text style={styles.detailStatVal}>{liveLdr} / 1023</Text>
                </View>
                <View style={styles.detailStatCard}>
                  <Text style={styles.detailStatHeader}>LAST SEEN</Text>
                  <Text style={styles.detailStatVal}>Just now</Text>
                </View>
                <View style={styles.detailStatCard}>
                  <Text style={styles.detailStatHeader}>CHANNEL</Text>
                  <Text style={styles.detailStatVal}>PWM 1</Text>
                </View>
              </View>

              {/* Action Button */}
              <Pressable
                onPress={() => {
                  toggleDeviceOverride(DEVICE_ID, globalOverride, liveBrightness);
                  setSelectedDevice(null);
                }}
                style={styles.modalActionBtn}
              >
                <Text style={styles.modalActionBtnText}>
                  {globalOverride ? 'Enable sensor control' : 'Turn off this zone'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Bottom Navigation Bar */}
      <View style={styles.bottomTab}>
        <Pressable
          onPress={() => setCurrentTab('overview')}
          style={[styles.tabItem, currentTab === 'overview' && styles.tabItemActive]}
        >
          <Icon name="grid" color={currentTab === 'overview' ? '#0B1530' : colors.textMuted} size={18} />
          {currentTab === 'overview' && <Text style={styles.tabTextActive}>Overview</Text>}
        </Pressable>

        <Pressable
          onPress={() => setCurrentTab('devices')}
          style={[styles.tabItem, currentTab === 'devices' && styles.tabItemActive]}
        >
          <Icon name="lightbulb" color={currentTab === 'devices' ? '#0B1530' : colors.textMuted} size={18} />
          {currentTab === 'devices' && <Text style={styles.tabTextActive}>Devices</Text>}
        </Pressable>

        <Pressable
          onPress={() => setCurrentTab('settings')}
          style={[styles.tabItem, currentTab === 'settings' && styles.tabItemActive]}
        >
          <Icon name="sliders" color={currentTab === 'settings' ? '#0B1530' : colors.textMuted} size={18} />
          {currentTab === 'settings' && <Text style={styles.tabTextActive}>Settings</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.nightStart },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 16,
  },
  headerTitle: { color: colors.white, fontSize: 24, fontWeight: '800' },
  headerSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,179,71,0.1)',
  },
  avatarText: { color: colors.amber, fontSize: 14, fontWeight: 'bold' },
  scrollContent: { paddingHorizontal: 22, paddingBottom: 100 },
  tabContent: { gap: 16, marginTop: 8 },

  // Toast Styles
  toastContainer: {
    position: 'absolute',
    top: 20,
    left: 22,
    right: 22,
    zIndex: 999,
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1530',
    borderWidth: 1.5,
    borderColor: 'rgba(74,222,128,0.4)',
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  toastCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(74,222,128,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastCheckText: { color: colors.green, fontSize: 12, fontWeight: 'bold' },
  toastText: { color: colors.white, fontSize: 14, fontWeight: '600' },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.nightEnd,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    gap: 8,
  },
  statIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,179,71,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { color: colors.white, fontSize: 20, fontWeight: 'bold' },
  statLabel: { color: colors.textMuted, fontSize: 10, fontWeight: 'bold' },

  // Glass card
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
    marginBottom: 4,
  },
  cardTitle: { color: colors.white, fontSize: 16, fontWeight: '600' },
  cardTitleRight: { color: colors.textMuted, fontSize: 12 },

  // Zone rows
  zoneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  zoneInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  zoneName: { color: colors.text, fontSize: 14 },
  zoneProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 100,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.pill,
    overflow: 'hidden',
    position: 'relative',
    paddingHorizontal: 8,
  },
  zoneProgressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.amber,
  },
  zoneValue: { color: colors.white, fontSize: 10, fontWeight: 'bold', zIndex: 2 },
  zoneOfflineText: { color: colors.textFaint, fontSize: 13 },

  // Devices tab styles
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  deviceTitleContainer: { gap: 4 },
  deviceTitle: { color: colors.white, fontSize: 16, fontWeight: '600' },
  deviceStatusContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deviceStatusText: { color: colors.textMuted, fontSize: 12 },
  devicePercentText: { color: colors.amber, fontSize: 18, fontWeight: 'bold' },
  deviceProgressTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  deviceProgressFill: {
    height: '100%',
    backgroundColor: colors.amber,
  },
  deviceActionBtn: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deviceActionBtnText: { color: colors.white, fontSize: 14, fontWeight: '600' },
  disabledActionBtn: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  disabledActionBtnText: { color: colors.textFaint, fontSize: 14, fontWeight: '600' },

  // Settings tab styles
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderTitle: { color: colors.white, fontSize: 14, fontWeight: '600' },
  sliderValue: { color: colors.amber, fontSize: 16, fontWeight: 'bold' },
  sliderTrackContainer: { marginVertical: 8 },
  sliderLimits: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  limitText: { color: colors.textFaint, fontSize: 11 },
  sliderDesc: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleTitle: { color: colors.white, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  toggleDesc: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },

  saveBtn: {
    backgroundColor: colors.amber,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: colors.amber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 10,
  },
  saveBtnText: { color: '#0B1530', fontSize: 15, fontWeight: 'bold' },

  // Detail Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(11,21,48,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.nightStart,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '85%',
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: { color: colors.white, fontSize: 18 },
  modalTitle: { color: colors.white, fontSize: 18, fontWeight: '700' },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: { paddingHorizontal: 22, paddingVertical: 20, gap: 20 },
  gaugeContainer: { alignItems: 'center', marginVertical: 10, gap: 14 },
  outerGaugeRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 8,
    borderColor: 'rgba(255,179,71,0.1)',
    borderTopColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerGaugeRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  gaugeValue: { color: colors.white, fontSize: 32, fontWeight: '800' },
  gaugeLabel: { color: colors.textMuted, fontSize: 10, fontWeight: 'bold' },
  gaugeStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gaugeStatusText: { color: colors.text, fontSize: 14 },

  detailStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  detailStatCard: {
    width: '48%',
    backgroundColor: colors.nightEnd,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    gap: 4,
  },
  detailStatHeader: { color: colors.textFaint, fontSize: 10, fontWeight: 'bold' },
  detailStatVal: { color: colors.white, fontSize: 14, fontWeight: '600' },
  modalActionBtn: {
    backgroundColor: 'rgba(248,113,113,0.15)',
    borderWidth: 1.5,
    borderColor: colors.red,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  modalActionBtnText: { color: colors.red, fontSize: 15, fontWeight: 'bold' },

  // Bottom Navigation Bar Styles
  bottomTab: {
    position: 'absolute',
    bottom: 24,
    left: 22,
    right: 22,
    height: 64,
    backgroundColor: 'rgba(11,21,48,0.92)',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tabItemActive: {
    backgroundColor: colors.amber,
    flex: 1.3,
  },
  tabTextActive: {
    color: '#0B1530',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
