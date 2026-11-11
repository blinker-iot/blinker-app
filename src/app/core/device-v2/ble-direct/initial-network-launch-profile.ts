import { Capacitor } from '@capacitor/core';
import { initialNetworkCheckpointNative, snapshotInitialNetworkAdmission, type InitialNetworkAdmission } from './initial-network-checkpoint';

/** Explicit bundled metadata only; no fallback source, intent or Key. */
export async function readInitialNetworkLaunchProfile(): Promise<InitialNetworkAdmission | undefined> {
  if (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('BlinkerBc5Checkpoint')) return undefined;
  try { return snapshotInitialNetworkAdmission(await initialNetworkCheckpointNative.getInitialNetworkAdmission()); }
  catch { throw Error('INITIAL_NETWORK_LAUNCH_PROFILE_UNAVAILABLE'); }
}
