import { USE_MOCK_BT } from '../config';
import { MockTransport } from './MockTransport';
import type { BtTransport } from './transport';

export type { BtTransport, BtDevice } from './transport';

/**
 * Pick a transport at runtime. ClassicTransport is require()'d lazily so its
 * native module (react-native-bluetooth-classic) is never loaded when running
 * in mock mode — that lets the mock run in plain Expo Go with no dev build.
 */
export function createTransport(): BtTransport {
  if (USE_MOCK_BT) return new MockTransport();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ClassicTransport } = require('./ClassicTransport');
  return new ClassicTransport();
}
