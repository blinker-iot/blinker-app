import { describe, expect, it } from 'vitest';

import { DeviceV2RouteError } from '../protocol/device-v2/session';
import { Bbp2ErrorCode } from '../protocol/device-v2/types';
import { deviceV2ErrorMessage } from './device-v2-error';

describe('deviceV2ErrorMessage', () => {
  it('keeps the wire error and appends an actionable Chinese explanation', () => {
    const error = new DeviceV2RouteError(Bbp2ErrorCode.UnknownEndpoint);

    expect(deviceV2ErrorMessage(error, '设备同步失败')).toBe(
      'Device V2 route failed with wire error 5：未获取到设备能力，或设备当前未上线。',
    );
  });

  it('recognizes a serialized wire error message', () => {
    const error = new Error('Device V2 route failed with wire error 12');

    expect(deviceV2ErrorMessage(error, '指令发送失败')).toBe(
      'Device V2 route failed with wire error 12：操作过于频繁，请稍后再试。',
    );
  });

  it('keeps useful non-protocol error messages unchanged', () => {
    expect(deviceV2ErrorMessage(new Error('connection lost'), '设备同步失败'))
      .toBe('connection lost');
  });

  it('uses the caller fallback for an unknown failure', () => {
    expect(deviceV2ErrorMessage(undefined, '设备同步失败')).toBe('设备同步失败');
  });
});
