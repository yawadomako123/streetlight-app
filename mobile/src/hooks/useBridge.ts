import { useSyncExternalStore } from 'react';
import { bridge, type BridgeSnapshot } from '../bluetooth/BridgeService';

/** Subscribe a component to the shared BridgeService snapshot. */
export function useBridge(): BridgeSnapshot {
  return useSyncExternalStore(
    (cb) => bridge.subscribe(cb),
    () => bridge.getSnapshot(),
  );
}
