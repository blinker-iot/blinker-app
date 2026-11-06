import { capabilityBooleanLabel, capabilityDisplayName, deviceDisplayName, displayText, parseDeviceDisplayMetadata } from './display-metadata';

const record = () => ({ logicalDeviceId: 'device_a', revision: 3, name: '客厅灯', capabilities: [
  { key: 'power', kind: 0, type: 0, displayName: '电源开关', trueLabel: '亮', falseLabel: '灭' },
] });
describe('shared display metadata (not protocol semantics or authority)', () => {
  it('resolves typed power defaults without renaming unknown types or protocol keys', () => {
    expect(capabilityDisplayName(undefined, { key: 'power', kind: 0, type: 0 })).toBe('电源开关');
    for (const type of [1, 2, 3, 4]) {
      expect(capabilityDisplayName(undefined, { key: 'power', kind: 0, type })).toBe('功率');
    }
    for (const type of [undefined, 5, 9]) {
      expect(capabilityDisplayName(undefined, { key: 'power', kind: 0, type })).toBe('power');
    }
    expect(capabilityDisplayName(undefined, { ...{ key: 'power', valueType: 'boolean' } })).toBe('电源开关');
    expect(capabilityDisplayName(undefined, { ...{ key: 'power', valueType: 'number' } })).toBe('功率');
    expect(capabilityDisplayName(undefined, { ...{ key: 'power', type: 5, valueType: 'boolean' } })).toBe('power');
    expect(capabilityDisplayName(undefined, { key: 'customPower', type: 0 })).toBe('customPower');
    for (const key of ['constructor', '__proto__', 'toString']) {
      expect(capabilityDisplayName(undefined, { key, type: 0 })).toBe(key);
    }
  });
  it('resolves stable key/kind/type and ignores incompatible or orphan aliases', () => {
    const metadata = parseDeviceDisplayMetadata(record()), device = { name: 'old', displayMetadata: metadata };
    expect(deviceDisplayName(device)).toBe('客厅灯');
    expect(capabilityDisplayName(device, { key: 'power', kind: 0, type: 0 })).toBe('电源开关');
    expect(capabilityDisplayName(device, { key: 'power', kind: 0, type: 0 }, '我的开关')).toBe('我的开关');
    expect(capabilityDisplayName(device, { key: 'power', kind: 0, type: 0 }, 'power')).toBe('power');
    expect(capabilityBooleanLabel(device, { key: 'power', kind: 0, type: 0 }, true)).toBe('亮');
    expect(capabilityBooleanLabel(device, { key: 'power', kind: 0, type: 0 }, false)).toBe('灭');
    for (const [endpoint, name] of [[{ key: 'power', kind: 1, type: 0 }, '电源开关'],
      [{ key: 'power', kind: 0, type: 2 }, '功率'], [{ key: 'missing', kind: 0, type: 0 }, 'missing']] as const) {
      expect(capabilityDisplayName(device, endpoint)).toBe(name);
      expect(capabilityBooleanLabel(device, endpoint, true)).toBe('开');
    }
    expect(capabilityDisplayName(device, { key: 'power' })).toBe('power');
    expect(metadata).toEqual(record());
    expect(deviceDisplayName({ config: { customName: '  ' } }, '未命名')).toBe('未命名');
  });
  it('accepts bare descriptors, canonicalizes order and preserves literal Manifest keys', () => {
    expect(parseDeviceDisplayMetadata({ ...record(), capabilities: [
      { key: 'z', kind: 2, type: 9 }, { key: ' a ', kind: 0, type: 0 } ] }).capabilities.map(c => c.key)).toEqual([' a ', 'z']);
  });
  it('rejects wrong identity/revision, duplicates, executable fields, invalid Unicode and scalar labels', () => {
    const invalid = [
      { ...record(), revision: -1 }, { ...record(), name: 'a\0b' }, { ...record(), name: '\ud800' },
      { ...record(), name: ' 蜗牛' }, { ...record(), name: '蜗'.repeat(86) }, { ...record(), permissions: 3 },
      { ...record(), capabilities: [record().capabilities[0], record().capabilities[0]] },
      { ...record(), capabilities: [{ ...record().capabilities[0], type: 2 }] },
      { ...record(), capabilities: [{ ...record().capabilities[0], key: '蜗'.repeat(22) }] },
      { ...record(), capabilities: [{ ...record().capabilities[0], script: 'run()' }] },
      { ...record(), capabilities: [{ ...record().capabilities[0], displayName: 'x'.repeat(81) }] },
    ];
    for (const value of invalid) expect(() => parseDeviceDisplayMetadata(value)).toThrow();
    expect(() => parseDeviceDisplayMetadata(record(), 'other')).toThrow();
    expect(displayText('  起居室  ')).toBe('起居室');
  });
});
