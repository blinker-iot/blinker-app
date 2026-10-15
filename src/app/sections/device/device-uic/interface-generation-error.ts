export function interfaceGenerationError(code: unknown): Error & { code: string } {
  const value = typeof code === 'string' ? code : 'INTERFACE_AI_GENERATION_FAILED';

  return Object.assign(new Error(value), { code: value });
}

export function interfaceGenerationErrorMessage(error: unknown): string {
  const failure = error as { code?: string; name?: string } | null;
  const code = failure?.name === 'TimeoutError' ? 'INTERFACE_AI_TIMEOUT' : failure?.code;

  switch (code) {
    case 'INTERFACE_AI_AUTH_EXPIRED':
      return '登录已失效，请在当前服务区域重新登录后再生成。';
    case 'INTERFACE_AI_REGION_MISMATCH':
    case 'SERVICE_REGION_MISMATCH':
      return '当前服务区域与登录环境不一致，请切换到对应区域并重新登录。';
    case 'INTERFACE_AI_ACCESS_DENIED':
      return '当前账号无法使用 AI 生成，请检查账号状态与权限。';
    case 'INTERFACE_AI_QUOTA_EXCEEDED':
      return '当前账号的 AI 额度不足。此前已完成的模型调用可能已消耗额度。';
    case 'INTERFACE_AI_REQUEST_PENDING':
      return '本次模型调用状态尚未确认，请稍后查看，不要重复生成。';
    case 'INTERFACE_AI_REQUEST_COMPLETED':
      return '本次模型调用已完成，但结果无法重新获取。再次生成会发起新的收费调用。';
    case 'INTERFACE_AI_REQUEST_CONFLICT':
      return '生成请求标识与内容不一致，请刷新后重新发起。';
    case 'INTERFACE_AI_UNAVAILABLE':
      return 'AI 服务暂不可用，请稍后重试或联系服务管理员。';
    case 'INTERFACE_AI_RATE_LIMIT':
      return '生成请求较多，请稍后重试。';
    case 'INTERFACE_AI_TIMEOUT':
    case 'GATEWAY_TIMEOUT':
      return '生成超时，请重试。';
    case 'INTERFACE_AI_INCOMPLETE':
      return '生成结果未完整返回，请重试。';
    case 'INTERFACE_AI_OUTPUT_TOO_LARGE':
      return '生成内容过长，请简化需求后重试。';
    case 'INTERFACE_AI_INVALID_RESPONSE':
      return '生成结果未通过校验，请重试。';
    case 'INTERFACE_AI_INVALID_REQUEST':
      return '生成请求未通过校验，请刷新后重试；若仍失败，请联系服务管理员。';
    default:
      return '生成未完成，请稍后重试。';
  }
}
