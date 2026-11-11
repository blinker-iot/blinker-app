import { describe, expect, it, vi } from 'vitest';
import { bytesToHex, hexToBytes } from '../../protocol/device-v2/codec';
import { acceptWiFiProvRekeyPermit, authorizeWiFiProvRekeySetup, challengeWiFiProvRekey, installWiFiProvRekey,
  readWiFiProvRekeyReceipt } from './wifiprov-rekey-wire';

const operationId = '101112131415161718191a1b1c1d1e1f';
const challenge = '202122232425262728292a2b2c2d2e2f';
const instance = '303132333435363738393a3b3c3d3e3f';
const oldLocator = '42e3b10bd1fdb72f963710d6053fc845';
const newLocator = '993914c5e39e1379987843dff3cf24fa';
const oldBinding = `${operationId}${challenge}${instance}0102030410203040${oldLocator}`;
const newBinding = `${oldBinding}${newLocator}`;
const iv = '404142434445464748494a4b';
const box = 'e758aa31d13a9ec9ca8cb4e74517d3e110a9f1c5f3f82aadc445d8adac883dde5a4d75f584b5da61836ca373d2327caf';
const proof = '18fdbd40feaed63861c522255279a3e71dbc6f732d74313212b675a0fb491527';
const receipt = '3f7b9b1533b87deb9b435d32c2628374a16a9e37d92e8b7aa8bbfe5853144789';
const binding = () => ({ operationId: hexToBytes(operationId), challenge: hexToBytes(challenge), instance: hexToBytes(instance),
  accessEpoch: 0x01020304, fromVersion: 0x10203040, oldLocator: hexToBytes(oldLocator), newLocator: hexToBytes(newLocator) });
const reply = (encoded: string) => ({ request: vi.fn(async () => hexToBytes(encoded)) });

describe('fixed blinker-config rekey wire', () => {
  it.each([
    ['challenge', challengeWiFiProvRekey, 74, `0204${oldBinding}`, `020400${operationId}${proof}`, proof],
    ['install', installWiFiProvRekey, 150, `0205${newBinding}${iv}${box}`, `020500${operationId}${receipt}`, receipt],
    ['read receipt', readWiFiProvRekeyReceipt, 90, `0206${newBinding}`, `020600${operationId}${receipt}`, receipt],
  ] as const)('uses the Gateway/device exact vector for %s and erases its temporary request', async (_, send, length, expected, response, mac) => {
    const args = binding(), nonce = hexToBytes(iv), ciphertext = hexToBytes(box);
    const decoded = hexToBytes(response);
    const request = vi.fn(async (endpoint: string, bytes: Uint8Array) => {
      expect(endpoint).toBe('blinker-config');
      expect(bytes.length).toBe(length);
      expect(bytesToHex(bytes)).toBe(expected);
      return decoded;
    });
    const result = await send({ request }, args, nonce, ciphertext);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1].some(Boolean)).toBe(false);
    decoded.fill(0);
    expect(bytesToHex(result)).toBe(mac);
    expect(bytesToHex(nonce)).toBe(iv);
    expect(bytesToHex(ciphertext)).toBe(box);
  });

  it.each(['0205', '020500', `010500${operationId}${receipt}`, `020600${operationId}${receipt}`,
    `020500${challenge}${receipt}`, `020500${operationId}${'00'.repeat(32)}`,
    `020500${operationId}${receipt}00`, `020509${operationId}${receipt}`, '02050a', '020404'])
  ('rejects an uncorrelated, short or malformed Install reply: %s', async encoded => {
    const transport = reply(encoded);
    await expect(installWiFiProvRekey(transport, binding(), hexToBytes(iv), hexToBytes(box)))
      .rejects.toMatchObject({ code: 'WIFIPROV_REKEY_PROTOCOL_MISMATCH' });
    expect(transport.request).toHaveBeenCalledTimes(1);
  });

  it.each([['020509', 'PROVISIONING_RESULT_UNKNOWN', 9], ['020506', 'WIFIPROV_REKEY_DEVICE_REJECTED', 6]] as const)
  ('distinguishes exact persistence UNKNOWN from an explicit device status: %s', async (encoded, code, status) => {
    const transport = reply(encoded);
    await expect(installWiFiProvRekey(transport, binding(), hexToBytes(iv), hexToBytes(box))).rejects.toMatchObject({ code, status });
    expect(transport.request).toHaveBeenCalledTimes(1);
  });

  it.each([{ operationId: new Uint8Array(16) }, { challenge: new Uint8Array(15).fill(1) }, { instance: new Uint8Array(16) },
    { accessEpoch: 0 }, { accessEpoch: 0x100000000 }, { fromVersion: 0xffffffff }, { fromVersion: 1.5 },
    { oldLocator: new Uint8Array(16) }, { newLocator: hexToBytes(oldLocator) }])
  ('refuses invalid binding before any device exchange: %j', async change => {
    const transport = reply(`020600${operationId}${receipt}`);
    await expect(readWiFiProvRekeyReceipt(transport, { ...binding(), ...change }))
      .rejects.toMatchObject({ code: 'WIFIPROV_REKEY_REQUEST_INVALID' });
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('checks install envelope size/IV before I/O, and never retries a rejected transport call', async () => {
    const fail = Error('transport-error');
    const request = vi.fn(async (_endpoint: string, _bytes: Uint8Array) => { throw fail; });
    await expect(installWiFiProvRekey({ request }, binding(), new Uint8Array(12), hexToBytes(box)))
      .rejects.toMatchObject({ code: 'WIFIPROV_REKEY_REQUEST_INVALID' });
    await expect(installWiFiProvRekey({ request }, binding(), hexToBytes(iv), new Uint8Array(47)))
      .rejects.toMatchObject({ code: 'WIFIPROV_REKEY_REQUEST_INVALID' });
    expect(request).not.toHaveBeenCalled();
    await expect(installWiFiProvRekey({ request }, binding(), hexToBytes(iv), hexToBytes(box))).rejects.toBe(fail);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1].some(Boolean)).toBe(false);
  });

  it('correlates against the operation sent even if a caller mutates its original bytes', async () => {
    const args = binding();
    const request = vi.fn(async () => {
      args.operationId.fill(0xff);
      return hexToBytes(`020400${operationId}${proof}`);
    });
    expect(bytesToHex(await challengeWiFiProvRekey({ request }, args))).toBe(proof);
  });

  it('binds the current owner with the exact 08/09 packets and local-only Admin HMAC', async () => {
    const controllerId = '55'.repeat(16), nonce = '66'.repeat(16);
    const key = new Uint8Array(32).fill(0x5a);
    const hmac = 'b22d80fa878ae85c3e3b5b711f7b546607e545bb35ac669bd84ad0212283a76e';
    const sent: string[] = [];
    const request = vi.fn(async (endpoint: string, payload: Uint8Array) => {
      expect(endpoint).toBe('blinker-config'); sent.push(bytesToHex(payload));
      return hexToBytes(payload[1] === 8 ? `020800${nonce}` : `020900${operationId}`);
    });
    await authorizeWiFiProvRekeySetup({ request }, binding(), { controllerId: hexToBytes(controllerId),
      credentialVersion: 0x11223344, controllerSecret: key }, () => undefined);
    expect(sent).toEqual(['0208', `0209${oldBinding}${controllerId}11223344${nonce}${hmac}`]);
    expect(sent[1].length / 2).toBe(142);
    expect(sent[1]).not.toContain(bytesToHex(key));
  });

  it('never sends Admin proof after the 08 owner was retired', async () => {
    let live = true;
    const request = vi.fn(async () => { live = false; return hexToBytes(`020800${'66'.repeat(16)}`); });
    await expect(authorizeWiFiProvRekeySetup({ request }, binding(), { controllerId: hexToBytes('55'.repeat(16)),
      credentialVersion: 1, controllerSecret: hexToBytes('5a'.repeat(32)) }, () => { if (!live) throw Error('owner retired'); }))
      .rejects.toThrow('owner retired');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('requires a 19-byte exact matching 07 ACK before arming WiFi', async () => {
    const permit = '71'.repeat(32);
    const request = vi.fn(async (_endpoint: string, payload: Uint8Array) => {
      expect(payload.length).toBe(122); expect(bytesToHex(payload)).toBe(`0207${newBinding}${permit}`);
      return hexToBytes(`020700${operationId}`);
    });
    await expect(acceptWiFiProvRekeyPermit({ request }, binding(), hexToBytes(permit))).resolves.toBeUndefined();
    for (const invalid of ['020700', `020700${challenge}`, `020900${operationId}`]) {
      await expect(acceptWiFiProvRekeyPermit(reply(invalid), binding(), hexToBytes(permit)))
        .rejects.toMatchObject({ code: 'WIFIPROV_REKEY_PROTOCOL_MISMATCH' });
    }
  });
});
