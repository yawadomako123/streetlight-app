/**
 * BridgeService — the phone's version of backend/usb-bridge.js.
 *
 * It owns a BtTransport and, for the lifetime of a connection:
 *   • parses inbound "ldr:X,motion:Y,led:Z" telemetry and relays it to the
 *     backend (POST /telemetry), exactly like the USB bridge did;
 *   • answers the Arduino's "SYNC_REQUEST" by fetching the device's automation
 *     config (GET /sync/:id) and writing back "SYNC:{...}";
 *   • falls back to a locally-held config when the backend is unreachable, so
 *     the light keeps working with no internet.
 *
 * UI subscribes via `subscribe()` and reads immutable snapshots.
 */
import { createTransport, type BtDevice, type BtTransport } from './index';
import { buildSyncLine, isSyncRequest, parseTelemetry } from './protocol';
import { DEVICE_ID, RELAY_TO_BACKEND } from '../config';
import * as api from '../api/client';
import type { ConnectionState, SyncConfig, Telemetry } from '../types';
import { defaultSyncConfig } from '../types';

export interface LogEntry {
  at: number;
  dir: 'in' | 'out' | 'info' | 'error';
  text: string;
}

export interface BridgeSnapshot {
  connection: ConnectionState;
  transportKind: string;
  deviceName: string | null;
  latest: Telemetry | null;
  config: SyncConfig;      // last config we pushed to the Arduino
  relayOk: boolean | null; // last backend relay result (null = not attempted)
  error: string | null;
  log: LogEntry[];
}

const MAX_LOG = 60;

export class BridgeService {
  private transport: BtTransport = createTransport();
  private unsubLine: (() => void) | null = null;
  private unsubDisc: (() => void) | null = null;
  private listeners = new Set<(s: BridgeSnapshot) => void>();

  private snap: BridgeSnapshot = {
    connection: 'disconnected',
    transportKind: this.transport.kind,
    deviceName: null,
    latest: null,
    config: defaultSyncConfig(),
    relayOk: null,
    error: null,
    log: [],
  };

  // ── Subscription ────────────────────────────────────────────────────────────
  subscribe(fn: (s: BridgeSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snap);
    return () => this.listeners.delete(fn);
  }

  getSnapshot(): BridgeSnapshot {
    return this.snap;
  }

  private set(patch: Partial<BridgeSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l(this.snap));
  }

  private log(dir: LogEntry['dir'], text: string) {
    const entry: LogEntry = { at: Date.now(), dir, text };
    const log = [entry, ...this.snap.log].slice(0, MAX_LOG);
    this.set({ log });
  }

  // ── Connection lifecycle ─────────────────────────────────────────────────────
  async ensureReady(): Promise<void> {
    await this.transport.ensureReady();
  }

  async listDevices(): Promise<BtDevice[]> {
    await this.transport.ensureReady();
    return this.transport.listDevices();
  }

  async connect(device: BtDevice): Promise<void> {
    // Ignore overlapping connect requests — a second attempt while the first is
    // still in flight leaves the HC-05's single RFCOMM slot busy and both fail
    // with "read ret: -1".
    if (this.snap.connection === 'connecting' || this.snap.connection === 'connected') {
      this.log('info', `Connect ignored — already ${this.snap.connection}`);
      return;
    }

    this.set({ connection: 'connecting', error: null, deviceName: device.name });
    try {
      await this.transport.connect(device.id);

      this.unsubLine = this.transport.onLine((line) => this.handleLine(line));
      this.unsubDisc = this.transport.onDisconnect(() => {
        this.log('error', 'Bluetooth link dropped');
        this.set({ connection: 'disconnected' });
        this.teardownSubs();
      });

      this.set({ connection: 'connected' });
      this.log('info', `Connected to ${device.name} over ${this.transport.kind}`);
    } catch (e: any) {
      this.set({ connection: 'error', error: e?.message ?? String(e) });
      this.log('error', `Connect failed: ${e?.message ?? e}`);
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    this.teardownSubs();
    await this.transport.disconnect();
    this.set({ connection: 'disconnected', deviceName: null });
    this.log('info', 'Disconnected');
  }

  private teardownSubs() {
    this.unsubLine?.();
    this.unsubDisc?.();
    this.unsubLine = null;
    this.unsubDisc = null;
  }

  // ── Inbound line handling (mirrors usb-bridge.js handleSerialLine) ───────────
  private handleLine(line: string) {
    if (isSyncRequest(line)) {
      void this.handleSyncRequest();
      return;
    }

    const t = parseTelemetry(line);
    if (!t) {
      this.log('in', `? ${line}`);
      return;
    }

    this.set({ latest: t });
    void this.relayTelemetry(t);
  }

  private async relayTelemetry(t: Telemetry) {
    if (!RELAY_TO_BACKEND) return;
    try {
      await api.postTelemetry(DEVICE_ID, t);
      if (this.snap.relayOk !== true) this.set({ relayOk: true });
    } catch (e: any) {
      if (this.snap.relayOk !== false) {
        this.set({ relayOk: false });
        this.log('error', `Backend relay failed: ${e?.message ?? e}`);
      }
    }
  }

  private syncInFlight = false;

  private async handleSyncRequest() {
    if (this.syncInFlight) return; // don't stack requests
    this.syncInFlight = true;
    try {
      let config = this.snap.config;

      if (RELAY_TO_BACKEND) {
        try {
          config = await api.getSync(DEVICE_ID);
          this.set({ config, relayOk: true });
        } catch {
          // Backend unreachable — reuse the last-known config so the light
          // keeps behaving instead of freezing.
          this.set({ relayOk: false });
        }
      }

      const outLine = buildSyncLine(config);
      await this.transport.write(outLine);
      this.log('out', outLine);
    } catch (e: any) {
      this.log('error', `Sync write failed: ${e?.message ?? e}`);
    } finally {
      this.syncInFlight = false;
    }
  }

  /**
   * Directly set the config pushed on the next SYNC_REQUEST. Used in
   * offline/direct mode (no backend) so the app itself is the source of truth.
   */
  setLocalConfig(patch: Partial<SyncConfig>) {
    this.set({ config: { ...this.snap.config, ...patch } });
  }
}

// Single shared instance for the app.
export const bridge = new BridgeService();
