import { environment } from '../../../environments/environment';

function configuredBaseUrl(): string {
  return environment.gatewayBaseUrl.trim().replace(/\/+$/, '');
}

export function gatewayUrl(path: string): string {
  const baseUrl = configuredBaseUrl();
  if (!baseUrl) {
    throw new Error('Gateway HTTP Base URL is not configured for this build.');
  }

  return `${baseUrl}/${path.replace(/^\/+/, '')}`;
}

export function isGatewayRequest(url: string): boolean {
  const baseUrl = configuredBaseUrl();
  if (!baseUrl) return false;

  try {
    const base = new URL(baseUrl);
    const request = new URL(url, base);
    const basePath = base.pathname.replace(/\/+$/, '');
    const apiPath = `${basePath}/api/v1`;
    return request.origin === base.origin
      && (request.pathname === apiPath || request.pathname.startsWith(`${apiPath}/`));
  } catch {
    return false;
  }
}

export function createGatewayRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
