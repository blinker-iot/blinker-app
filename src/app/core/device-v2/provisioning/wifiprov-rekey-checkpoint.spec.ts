import { describe, expect, it } from 'vitest';
import { base64UrlEncode } from '../base64url';
import { applyWiFiProvRekeyEvent, createWiFiProvRekeyCheckpoint, validateWiFiProvRekeyCheckpoint,
  type WiFiProvRekeyEvent, type WiFiProvRekeyScope } from './wifiprov-rekey-checkpoint';

const id = (value: number) => base64UrlEncode(new Uint8Array(16).fill(value));
const scope: WiFiProvRekeyScope = { authority: 'https://example.test', accountId: 'owner', region: 'Development',
  logicalDeviceId: 'device_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', deviceInstanceId: id(1), accessEpoch: 2,
  operationId: id(2), previous: { credentialVersion: 4, locator: id(3) } };
const next = { credentialVersion: 5, locator: id(4) };
const evidence = (observedAt: number) => ({ scope, next, observedAt });
const prepared = () => createWiFiProvRekeyCheckpoint(scope, 100);
const transition = (checkpoint: unknown, event: WiFiProvRekeyEvent, now: number) =>
  applyWiFiProvRekeyEvent(checkpoint, scope, event, now);
const dispatchPrepare = () => transition(prepared(), { kind: 'dispatch', step: 'prepare' }, 100);
const prepareConfirmed = () => transition(dispatchPrepare(), { kind: 'prepared-confirmed', source: 'response', evidence: { scope, observedAt: 100 } }, 100);
const dispatchIssue = () => transition(prepareConfirmed(), { kind: 'dispatch', step: 'issue' }, 101);
const issue = () => transition(dispatchIssue(), { kind: 'issued', source: 'response', evidence: evidence(101) }, 101);
const dispatchInstall = () => transition(issue(), { kind: 'dispatch', step: 'install' }, 102);
const installed = () => transition(dispatchInstall(), { kind: 'install-verified', source: 'response', evidence: evidence(103) }, 103);
const dispatchCommit = () => transition(installed(), { kind: 'dispatch', step: 'commit' }, 104);
const committed = () => transition(dispatchCommit(), { kind: 'commit-verified', source: 'response', evidence: evidence(105) }, 105);
const dispatchWiFi = () => transition(committed(), { kind: 'dispatch', step: 'wifi' }, 106);
const saved = (value: unknown) => JSON.parse(JSON.stringify(value));

describe('WiFiProv rekey checkpoint: one original write, then evidence', () => {
  it('keeps one logical device, physical instance and original root throughout the complete sequence', () => {
    const wifi = dispatchWiFi();
    expect(wifi).toMatchObject({ phase: 'wifi-dispatched', scope, next, wifiDispatchedAt: 106 });
    const receipt = transition(wifi, { kind: 'wifi-receipt', result: 'accepted', evidence: evidence(107) }, 107);
    const online = transition(receipt, { kind: 'cloud-online', evidence: { ...evidence(110), issuedAt: 108, stateUpdatedAt: 109 } }, 110);
    expect(online).toEqual({ version: 1, phase: 'wifi-accepted', scope, next,
      createdAt: 100, updatedAt: 110, wifiDispatchedAt: 106, cloudConfirmedAt: 110 });
  });

  it.each([['prepare', dispatchPrepare, 100], ['issue', dispatchIssue, 101], ['install', dispatchInstall, 102], ['commit', dispatchCommit, 104],
    ['wifi', dispatchWiFi, 106]] as const)(
    'does not dispatch %s again after persisting either a dispatch or UNKNOWN marker', (step, dispatch, at) => {
      const persisted = saved(dispatch());
      const event = { kind: 'dispatch', step } as const;
      expect(() => transition(persisted, event, at + 1)).toThrow('PHASE_CONFLICT');
      const unknown = transition(persisted, { kind: 'unknown', step }, at + 1);
      expect(unknown.phase).toBe(`${step}-unknown`);
      expect(() => transition(saved(unknown), event, at + 2)).toThrow('PHASE_CONFLICT');
    });

  it('cannot skip installation or commit; receipt, timeout and UI readiness are not dispatch permits', () => {
    expect(() => transition(prepared(), { kind: 'prepared-confirmed', source: 'response', evidence: { scope, observedAt: 101 } }, 101)).toThrow('PHASE_CONFLICT');
    expect(() => transition(prepareConfirmed(), { kind: 'issued', source: 'response', evidence: evidence(101) }, 101)).toThrow('PHASE_CONFLICT');
    expect(() => transition(issue(), { kind: 'dispatch', step: 'wifi' }, 102)).toThrow('PHASE_CONFLICT');
    expect(() => transition(dispatchInstall(), { kind: 'dispatch', step: 'commit' }, 103)).toThrow('PHASE_CONFLICT');
    expect(() => transition(dispatchCommit(), { kind: 'dispatch', step: 'wifi' }, 105)).toThrow('PHASE_CONFLICT');
    expect(() => transition(issue(), { kind: 'install-verified', source: 'response', evidence: evidence(102) }, 102)).toThrow('PHASE_CONFLICT');
    expect(() => transition(issue(), { kind: 'ready' } as any, 102)).toThrow('PHASE_CONFLICT');
  });

  it('only reconciles an unknown prepare from newly observed exact operation data', () => {
    const unknown = saved(transition(dispatchPrepare(), { kind: 'unknown', step: 'prepare' }, 101));
    const event = { kind: 'prepared-confirmed', source: 'read-only', evidence: { scope, observedAt: 102 } } as const;
    expect(() => transition(unknown, { ...event, source: 'response' }, 102)).toThrow('PHASE_CONFLICT');
    expect(() => transition(unknown, { ...event, evidence: { scope, observedAt: 101 } }, 102)).toThrow('CONTEXT_CHANGED');
    expect(transition(unknown, event, 102)).toMatchObject({ phase: 'prepare-confirmed' });
    expect(transition(saved(transition(dispatchIssue(), { kind: 'unknown', step: 'issue' }, 102)),
      { kind: 'issued', source: 'read-only', evidence: evidence(103) }, 103)).toMatchObject({ phase: 'issued', next });
  });

  it.each([['install', dispatchInstall, 102, 'installed'], ['commit', dispatchCommit, 104, 'committed']] as const)(
    'accepts only new exact read-only evidence after %s UNKNOWN', (step, dispatch, at, done) => {
      const unknown = saved(transition(dispatch(), { kind: 'unknown', step }, at + 2));
      const event = { kind: `${step}-verified`, source: 'read-only', evidence: evidence(at + 3) } as const;
      expect(() => transition(unknown, { ...event, source: 'response' }, at + 3)).toThrow('PHASE_CONFLICT');
      expect(() => transition(unknown, { ...event, evidence: evidence(at + 1) }, at + 3)).toThrow('CONTEXT_CHANGED');
      expect(() => transition(unknown, { ...event, evidence: evidence(at + 2) }, at + 3)).toThrow('CONTEXT_CHANGED');
      expect(() => transition(unknown, { ...event, evidence: { ...event.evidence, next: { ...next, locator: id(8) } } }, at + 3))
        .toThrow('CONTEXT_CHANGED');
      expect(transition(unknown, event, at + 3).phase).toBe(done);
    });

  it('keeps UNKNOWN official WiFi separate from fresh cloud confirmation and rejects stale sessions', () => {
    const unknown = transition(dispatchWiFi(), { kind: 'unknown', step: 'wifi' }, 108);
    expect(() => transition(unknown, { kind: 'wifi-receipt', result: 'accepted', evidence: evidence(109) }, 109)).toThrow('PHASE_CONFLICT');
    expect(() => transition(unknown, { kind: 'cloud-online', evidence: { ...evidence(110), issuedAt: 105, stateUpdatedAt: 109 } }, 110))
      .toThrow('CONTEXT_CHANGED');
    expect(() => transition(unknown, { kind: 'cloud-online', evidence: { ...evidence(110), issuedAt: 106, stateUpdatedAt: 109 } }, 110))
      .toThrow('CONTEXT_CHANGED');
    const online = transition(unknown, { kind: 'cloud-online', evidence: { ...evidence(110), issuedAt: 107, stateUpdatedAt: 109 } }, 110);
    expect(online).toMatchObject({ phase: 'wifi-unknown', wifiDispatchedAt: 106, cloudConfirmedAt: 110 });
    expect(() => transition(online, { kind: 'dispatch', step: 'wifi' }, 111)).toThrow('PHASE_CONFLICT');
  });

  it.each([{ authority: 'https://other.test' }, { accountId: 'other' }, { region: 'China' as const }, { deviceInstanceId: id(9) }, { accessEpoch: 3 },
    { operationId: id(9) }, { logicalDeviceId: 'device_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
    { previous: { ...scope.previous, locator: id(9) } }, { previous: { ...scope.previous, credentialVersion: 3 } }])(
    'rejects context changes in expected scope or otherwise verified evidence: %j', change => {
      const expected = { ...scope, ...change };
      expect(() => applyWiFiProvRekeyEvent(issue(), expected, { kind: 'dispatch', step: 'install' }, 102)).toThrow('CONTEXT_CHANGED');
      const proof = { ...evidence(103), scope: expected };
      expect(() => transition(dispatchInstall(), { kind: 'install-verified', source: 'response', evidence: proof }, 103)).toThrow('CONTEXT_CHANGED');
    });

  it('checks the next version, different locator and timestamps before recording', () => {
    for (const bad of [{ ...next, credentialVersion: 6 }, { ...next, credentialVersion: 4 }, { ...next, locator: scope.previous.locator }]) {
      expect(() => transition(dispatchIssue(), { kind: 'issued', source: 'response', evidence: { ...evidence(101), next: bad } }, 101))
        .toThrow('CHECKPOINT_INVALID');
    }
    expect(() => transition(issue(), { kind: 'dispatch', step: 'install' }, 99)).toThrow('CHECKPOINT_INVALID');
    expect(() => transition(dispatchIssue(), { kind: 'issued', source: 'response', evidence: evidence(102) }, 101)).toThrow('CONTEXT_CHANGED');
    expect(() => createWiFiProvRekeyCheckpoint({ ...scope, previous: { ...scope.previous, credentialVersion: 0xffffffff } }, 100))
      .toThrow('CHECKPOINT_INVALID');
  });

  it('serializes only detached immutable metadata and rejects secret fields, corrupt or impossible records', () => {
    const source = saved(scope), checkpoint = createWiFiProvRekeyCheckpoint(source, 100);
    source.previous.locator = id(9);
    expect(checkpoint.scope.previous.locator).toBe(id(3));
    expect(Object.isFrozen(checkpoint.scope.previous)).toBe(true);
    expect(validateWiFiProvRekeyCheckpoint(saved(issue()))).toEqual(issue());
    for (const value of [{ ...issue(), deviceKey: 'secret' }, { ...issue(), scope: { ...scope, password: 'secret' } },
      { ...issue(), next: { ...next, rawKey: 'secret' } }, { ...issue(), next: undefined }, { ...prepared(), next }, { ...dispatchPrepare(), next },
      { ...issue(), wifiDispatchedAt: 102 }, { ...issue(), cloudConfirmedAt: 103 }, { ...dispatchWiFi(), wifiDispatchedAt: 107 }]) {
      expect(() => validateWiFiProvRekeyCheckpoint(saved(value))).toThrow('CHECKPOINT_INVALID');
    }
  });
});
