import { DeviceV2RouteError } from '../protocol/device-v2/session';
import { Bbp2ErrorCode } from '../protocol/device-v2/types';

const routeErrorExplanations: Partial<Record<Bbp2ErrorCode, string>> = {
  [Bbp2ErrorCode.MalformedMessage]: '设备无法识别本次指令，请更新设备固件后重试。',
  [Bbp2ErrorCode.AuthenticationRequired]: '设备连接鉴权已失效，请重新连接。',
  [Bbp2ErrorCode.NegotiationRequired]: '设备能力尚未同步，请稍后重试。',
  [Bbp2ErrorCode.UnsupportedMessage]: '当前设备不支持此操作。',
  [Bbp2ErrorCode.UnknownEndpoint]: '未获取到设备能力，或设备当前未上线。',
  [Bbp2ErrorCode.CommandRejected]: '设备拒绝执行本次操作。',
  [Bbp2ErrorCode.ResourceExhausted]: '设备正忙，请稍后重试。',
  [Bbp2ErrorCode.Internal]: '设备通信发生内部错误，请稍后重试。',
  [Bbp2ErrorCode.SequenceConflict]: '设备数据正在同步，请稍后重试。',
  [Bbp2ErrorCode.StateConflict]: '设备状态已变化，请刷新后重试。',
  [Bbp2ErrorCode.ManifestConflict]: '设备能力已变化，正在重新同步。',
  [Bbp2ErrorCode.RateLimited]: '操作过于频繁，请稍后再试。',
};

const wireErrorPattern = /Device V2 route failed with wire error (\d+)/;

export function deviceV2ErrorMessage(error: unknown, fallback: string): string {
  const original = error instanceof Error && error.message ? error.message : fallback;
  const routeCode = deviceV2RouteErrorCode(error, original);
  const explanation = routeCode === undefined ? undefined : routeErrorExplanations[routeCode];

  return explanation ? `${original}：${explanation}` : original;
}

function deviceV2RouteErrorCode(error: unknown, message: string): Bbp2ErrorCode | undefined {
  if (error instanceof DeviceV2RouteError) return error.code;

  const match = wireErrorPattern.exec(message);
  if (!match) return undefined;

  const code = Number(match[1]);
  return Number.isInteger(code) ? code as Bbp2ErrorCode : undefined;
}
