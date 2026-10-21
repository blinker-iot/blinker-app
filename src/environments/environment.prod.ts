import { cloudBetaCapabilities } from './deployment';

export const environment = {
  production: true,
  deviceV2LanEnabled: false,
  deviceV2BleBootstrapPriorityEnabled: false,
  consoleWebBaseUrl: '',
  gatewayBaseUrl: 'https://iot.yiyu.pro',
  deployment: cloudBetaCapabilities,
};
