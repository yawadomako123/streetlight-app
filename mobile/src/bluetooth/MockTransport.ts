/**
 * A fake transport that behaves like an Arduino running the sketch, so the
 * whole app (UI, bridge logic, backend relay) can be exercised on an emulator
 * or in Expo Go with no hardware. Enable via EXPO_PUBLIC_USE_MOCK_BT=true.
 *
 * It emits "ldr:X,motion:Y,led:Z" telemetry every second and "SYNC_REQUEST"
 * every two seconds, and reacts to inbound "SYNC:{...}" pushes just like the
 * real firmware (override forces brightness, day/night follows the LDR sim).
 */
import type { BtDevice, BtTransport } from './transport';
import type { SyncConfig } from '../types';
import { defaultSyncConfig } from '../types';

const MOCK_DEVICE: BtDevice = { id: '98:D3:31:F4:12:3C', name: 'HC-05' };

export class MockTransport implements BtTransport {
  readonly kind = 'Mock';

  private connected = false;
  private lineHandlers = new Set<(line: string) => void>();
  private disconnectHandlers = new Set<() => void>();
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  // Simulated world state.
  private config: SyncConfig = defaultSyncConfig();
  private tick = 0;
  private brightness = 0;

  async ensureReady(): Promise<void> {
    /* nothing to do */
  }

  async listDevices(): Promise<BtDevice[]> {
    return [MOCK_DEVICE];
  }

  async connect(_deviceId: string): Promise<void> {
    this.connected = true;
    this.tick = 0;

    // Speeds up updates for real-time responsiveness (200ms telemetry, 400ms sync)
    this.telemetryTimer = setInterval(() => this.emitTelemetry(), 200);
    this.syncTimer = setInterval(() => this.emit('SYNC_REQUEST'), 400);
  }

  async disconnect(): Promise<void> {
    if (this.telemetryTimer) clearInterval(this.telemetryTimer);
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.telemetryTimer = null;
    this.syncTimer = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async write(line: string): Promise<void> {
    console.log(`[Mock Bluetooth TX] Inbound command: "${line}"`);
    if (line.startsWith('SYNC:')) {
      try {
        this.config = { ...this.config, ...JSON.parse(line.slice(5)) };
      } catch {
        /* ignore malformed */
      }
    }
  }

  onLine(handler: (line: string) => void): () => void {
    this.lineHandlers.add(handler);
    return () => this.lineHandlers.delete(handler);
  }

  onDisconnect(handler: () => void): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.add(handler);
  }

  private emit(line: string) {
    console.log(`[Mock Bluetooth RX] Outbound data: "${line}"`);
    this.lineHandlers.forEach((h) => h(line));
  }

  private emitTelemetry() {
    this.tick += 1;

    // Fake a day→night cycle over ~60s (300 ticks at 200ms each) and periodic "motion".
    const phase = (this.tick % 300) / 300; // 0..1
    const ldr = Math.round(400 + 380 * Math.sin(phase * Math.PI * 2)); // ~20..780
    const isNight = ldr <= (this.config.ldr_threshold ?? 150);
    const motion = this.tick % 60 < 15; // a few seconds of motion each cycle

    let target: number;
    if (this.config.manual_override) {
      target = this.config.target_brightness ?? 0;
    } else if (!this.config.schedule_active) {
      target = 0;
    } else if (!isNight) {
      target = 0;
    } else if (motion) {
      target = 255;
    } else {
      target = 50;
    }

    // Ease toward target like the firmware's fadeLedTo.
    this.brightness += Math.sign(target - this.brightness) * Math.min(25, Math.abs(target - this.brightness));

    this.emit(`ldr:${ldr},motion:${motion ? 1 : 0},led:${this.brightness}`);
  }
}
