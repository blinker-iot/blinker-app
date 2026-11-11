import type { Bc5AcceptanceClient } from './bc5-acceptance-client';
import type { BleDirectClient } from './client';
import type { BleDirectTarget } from './transport';
import type { InitialCloudWifiCarrierConsumer } from './cloud-registration-carrier';
import { completeInitialCloudWifiHandoff, type InitialCloudWifiCarrierEvidence } from '../provisioning/wifiprov-initial-cloud-observation';
import type { WiFiProvCloudReadPorts } from '../provisioning/wifiprov-cloud-reconciliation';

export type Bc5AcceptanceStage = 'preflight' | 'install' | 'activation' | 'wifi';

/** One foreground owner, one installation and one handoff. Dependencies are
 * the existing Direct, WiFiProv and Cloud observers, not a second protocol. */
export async function runBc5Acceptance(input: {
  authority: Pick<Bc5AcceptanceClient, 'preflight' | 'prepare' | 'issue' | 'installIssuedKey' | 'commit'>;
  cloud: Omit<WiFiProvCloudReadPorts, 'closeLocal'>;
  direct: Pick<BleDirectClient, 'installInitialCloudRegistrationKey'>;
  selectSource(): Promise<BleDirectTarget>;
  checkCarrier(): Promise<void>;
  carrier: InitialCloudWifiCarrierConsumer<InitialCloudWifiCarrierEvidence>;
  stage(value: Bc5AcceptanceStage): void;
}) {
  const { authority, cloud, direct, carrier, stage } = input;
  const { signal } = cloud;
  const check = () => { signal.throwIfAborted(); cloud.assertCurrent(); };
  stage('preflight'); check();
  await input.checkCarrier(); check();
  await authority.preflight(signal); check();
  const target = await input.selectSource(); check();
  await cloud.assertCloud(); check();
  await authority.prepare(signal); check();
  await authority.issue(signal); check();
  stage('install');
  const attempt = await authority.installIssuedKey(direct, target, signal);
  try {
    check(); stage('activation');
    return await completeInitialCloudWifiHandoff({ ...attempt, carrier: async use => {
      check(); stage('wifi'); return carrier(use);
    }, cloud, confirm: (request, commitSignal) => authority.commit(request, commitSignal) });
  } finally { await attempt.installation.close(); }
}
