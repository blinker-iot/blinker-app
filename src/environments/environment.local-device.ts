// Android USB hardware gate. This authority must also scope local credentials;
// never rewrite compiled bundles or switch authority after the App starts.
import { environment as local } from './environment.local';

export const environment = {
  ...local,
  gatewayBaseUrl: 'https://127.0.0.1:17000',
};
