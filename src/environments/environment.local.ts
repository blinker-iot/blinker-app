import { localCapabilities } from './deployment';

export const environment = {
  production: false,
  deviceV2LanEnabled: false,
  deviceV2BleBootstrapPriorityEnabled: false,
  consoleWebBaseUrl: 'http://127.0.0.1:4200',
  gatewayBaseUrl: 'http://127.0.0.1:17000',
  wifiProvRekeyPilotOperation: undefined as string | undefined,
  wifiProvSealedFirstInstall: false,
  deployment: localCapabilities,
};
