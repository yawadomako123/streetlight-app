/**
 * Transport abstraction. Everything above this line (BridgeService, the UI)
 * only knows about `BtTransport` — a bidirectional stream of newline-delimited
 * text. Swapping classic Bluetooth (HC-05/06) for BLE (HM-10) later means
 * writing one new implementation of this interface; nothing else changes.
 */

/** A pairable/connectable device discovered by the transport. */
export interface BtDevice {
  id: string;      // MAC address (Classic) or peripheral id (BLE)
  name: string;
}

export interface BtTransport {
  /** Human label for logs/UI, e.g. "Bluetooth Classic" or "Mock". */
  readonly kind: string;

  /** Ensure Bluetooth is on and permissions are granted. Throws on refusal. */
  ensureReady(): Promise<void>;

  /** List already-paired / known devices to choose from. */
  listDevices(): Promise<BtDevice[]>;

  /** Open a connection to a device by id. */
  connect(deviceId: string): Promise<void>;

  /** Close the current connection (safe to call when already closed). */
  disconnect(): Promise<void>;

  isConnected(): boolean;

  /** Write one line (a trailing newline is added by the implementation). */
  write(line: string): Promise<void>;

  /**
   * Subscribe to inbound lines (already split on newline, trimmed of CR/LF).
   * Returns an unsubscribe function.
   */
  onLine(handler: (line: string) => void): () => void;

  /** Subscribe to unexpected disconnects. Returns an unsubscribe function. */
  onDisconnect(handler: () => void): () => void;
}
