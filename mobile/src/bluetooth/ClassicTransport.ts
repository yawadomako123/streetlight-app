/**
 * Bluetooth Classic (SPP) transport for HC-05 / HC-06 modules, backed by
 * react-native-bluetooth-classic. Android only — classic SPP is not reachable
 * from iOS. For an HM-10 / BLE module, add a BleTransport implementing the same
 * BtTransport interface and select it in ./index.ts.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import RNBluetoothClassic, {
  BluetoothDevice,
} from 'react-native-bluetooth-classic';
import type { BtDevice, BtTransport } from './transport';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ClassicTransport implements BtTransport {
  readonly kind = 'Bluetooth Classic';

  private device: BluetoothDevice | null = null;
  private dataSub: { remove: () => void } | null = null;
  private disconnectSub: { remove: () => void } | null = null;
  private lineHandlers = new Set<(line: string) => void>();
  private disconnectHandlers = new Set<() => void>();

  async ensureReady(): Promise<void> {
    if (Platform.OS !== 'android') {
      throw new Error(
        'Bluetooth Classic (HC-05/06) is Android-only. Use a BLE module + BleTransport for iOS.',
      );
    }

    // Runtime permissions: request both Bluetooth and Location. On many Android devices,
    // Bluetooth Classic connections fail silently if GPS/Location permission is missing.
    const perms: string[] = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    if (Number(Platform.Version) >= 31) {
      perms.push(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      );
    }
    const granted = await PermissionsAndroid.requestMultiple(perms as any);
    const denied = Object.values(granted).some(
      (v) => v !== PermissionsAndroid.RESULTS.GRANTED,
    );
    if (denied) throw new Error('Required Bluetooth/Location permissions were denied.');

    const enabled = await RNBluetoothClassic.isBluetoothEnabled();
    if (!enabled) {
      const nowEnabled = await RNBluetoothClassic.requestBluetoothEnabled();
      if (!nowEnabled) throw new Error('Bluetooth is turned off.');
    }
  }

  async listDevices(): Promise<BtDevice[]> {
    const bonded = await RNBluetoothClassic.getBondedDevices();
    return bonded.map((d) => ({ id: d.address, name: d.name || d.address }));
  }

  async connect(deviceId: string): Promise<void> {
    console.log(`[Bluetooth] Attempting to connect to ${deviceId}...`);

    // A running discovery/scan blocks RFCOMM connects on Android — always stop it first.
    try {
      await RNBluetoothClassic.cancelDiscovery();
    } catch {
      /* not discovering — fine */
    }

    // Force close any stale/leaked socket at the native Java layer.
    // If the socket was leaked in a previous run, calling disconnect directly
    // clears the channel so the subsequent connect succeeds.
    try {
      console.log('[Bluetooth] Cleaning up stale sockets...');
      await RNBluetoothClassic.disconnectFromDevice(deviceId);
      await delay(1000);
    } catch {
      /* nothing to close — safe to continue */
    }

    const bonded = await RNBluetoothClassic.getBondedDevices();
    const device = bonded.find((d) => d.address === deviceId || d.id === deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} is not paired. Pair the HC-05 in Android Bluetooth settings first.`);
    }
    console.log(`[Bluetooth] Found device instance: ${device.name} (${device.address})`);

    // Connect with a SINGLE insecure RFCOMM attempt.
    //
    // The previous approach tried a secure socket, then an insecure one — firing
    // up to four socket opens in quick succession. This library leaks the failed
    // socket (RfcommConnectorThreadImpl swaps in a new socket WITHOUT closing the
    // old one, see lines 48-58), and every leaked half-open socket keeps the
    // HC-05's *single* RFCOMM channel busy — so each following attempt fails with
    // "read ret: -1". That's why simple apps (Serial Bluetooth Terminal) connect
    // and ours didn't: they do ONE clean attempt.
    //
    // HC-05/06 accept an insecure socket, and the library already retries
    // internally via its reflection channel-1 fallback, so one call is enough.
    console.log('[Bluetooth] ▶ Attempting default secure connection... ◀');
    let ok = false;
    try {
      ok = await device.connect();
    } catch (err: any) {
      console.log(`[Bluetooth] Secure connection failed (${err?.message ?? err}). Retrying with insecure RFCOMM socket...`);
      // Small delay to let the Android BT stack clear the socket
      await delay(1000);
      try {
        ok = await device.connect({ delimiter: '\n', secureSocket: false } as any);
      } catch (insecureErr: any) {
        throw new Error(
          `Bluetooth connection failed on both secure and insecure sockets: ${insecureErr?.message ?? insecureErr}. ` +
          `Verify the HC-05 is not connected to another app and power-cycle your phone's Bluetooth.`
        );
      }
    }
    if (!ok) throw new Error('connect() returned false');
    this.device = device;

    console.log(`[Bluetooth] Subscribing to data and disconnect events for ${deviceId}`);
    this.dataSub = device.onDataReceived((evt: { data: string }) => {
      console.log(`[Bluetooth RX] Raw data: "${evt.data}"`);
      this.ingest(evt.data);
    });

    this.disconnectSub = RNBluetoothClassic.onDeviceDisconnected(() => {
      console.log(`[Bluetooth] Disconnect event fired for ${deviceId}`);
      this.device = null;
      this.disconnectHandlers.forEach((h) => h());
    });
  }

  async disconnect(): Promise<void> {
    console.log('[Bluetooth] Disconnecting...');
    this.dataSub?.remove();
    this.disconnectSub?.remove();
    this.dataSub = null;
    this.disconnectSub = null;
    if (this.device) {
      try {
        await this.device.disconnect();
        console.log('[Bluetooth] Disconnected successfully');
      } catch (err) {
        console.warn('[Bluetooth] Disconnect error (already gone):', err);
      }
      this.device = null;
    }
  }

  isConnected(): boolean {
    return this.device !== null;
  }

  async write(line: string): Promise<void> {
    if (!this.device) throw new Error('Not connected.');
    console.log(`[Bluetooth TX] Writing: "${line}"`);
    await this.device.write(line + '\n');
  }

  onLine(handler: (line: string) => void): () => void {
    this.lineHandlers.add(handler);
    return () => this.lineHandlers.delete(handler);
  }

  onDisconnect(handler: () => void): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  // We connect with a '\n' delimiter, so each event is normally exactly one
  // protocol line with the delimiter already stripped. Split defensively in
  // case a single frame carries several lines (or a trailing newline).
  private ingest(chunk: string) {
    for (const part of chunk.split('\n')) {
      const line = part.trim();
      if (line) {
        console.log(`[Bluetooth Ingest] Dispatching line: "${line}"`);
        this.lineHandlers.forEach((h) => h(line));
      }
    }
  }
}
