// Explicit beta access to the existing automation and admitted Task routes.
// Device admission and fresh capacity still come from the server/device.
import { environment as production } from './environment.prod';

export const environment = {
  ...production,
  deployment: { ...production.deployment, automation: true, tasks: true },
};
