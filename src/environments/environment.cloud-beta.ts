// Explicit beta availability for existing Direct, automation and Task routes.
// Availability grants no access: scoped credentials, device capability and admission still apply.
import { environment as production } from './environment.prod';

// Explicit candidate only, supplied by Angular --define from the same
// non-secret native admission input. Never switch ordinary Beta implicitly.
declare const BLINKER_BC5_GATEWAY_ORIGIN: string | undefined;
const candidateOrigin = typeof BLINKER_BC5_GATEWAY_ORIGIN === 'undefined' ? undefined : BLINKER_BC5_GATEWAY_ORIGIN;
if (candidateOrigin !== undefined && (new URL(candidateOrigin).origin !== candidateOrigin
    || !candidateOrigin.startsWith('https://'))) throw Error('BC5_GATEWAY_ORIGIN_INVALID');

// Non-secret, single-intent selector. Only an explicitly built beta may use it;
// the Gateway independently pins account, device, binding and ingress.
declare const BLINKER_WIFIPROV_REKEY_OPERATION_ID: string | undefined;
const rekeyOperation = typeof BLINKER_WIFIPROV_REKEY_OPERATION_ID === 'undefined' ? undefined : BLINKER_WIFIPROV_REKEY_OPERATION_ID;
if (rekeyOperation !== undefined && (candidateOrigin !== undefined || typeof rekeyOperation !== 'string'
    || !/^[A-Za-z0-9_-]{21}[AQgw]$/.test(rekeyOperation) || rekeyOperation === 'AAAAAAAAAAAAAAAAAAAAAA')) {
  throw Error('WIFIPROV_REKEY_PILOT_INVALID');
}

declare const BLINKER_WIFIPROV_SEALED_FIRST_INSTALL: boolean | undefined;
const sealedFirstInstall = typeof BLINKER_WIFIPROV_SEALED_FIRST_INSTALL !== 'undefined' && BLINKER_WIFIPROV_SEALED_FIRST_INSTALL === true;
if (sealedFirstInstall && (candidateOrigin !== undefined || rekeyOperation !== undefined)) throw Error('WIFIPROV_SEALED_PILOT_CONFLICT');

export const environment = {
  ...production,
  ...(candidateOrigin ? { gatewayBaseUrl: candidateOrigin } : {}),
  wifiProvRekeyPilotOperation: rekeyOperation,
  wifiProvSealedFirstInstall: sealedFirstInstall,
  deployment: { ...production.deployment, automation: true, tasks: true, directAccess: true },
};
