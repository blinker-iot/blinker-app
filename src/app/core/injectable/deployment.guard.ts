import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { environment } from 'src/environments/environment';
import type { DeploymentCapabilities } from 'src/environments/deployment';

// Refuse closed deep links before constructing a page or starting its requests.
// This guard does not grant access when the corresponding service is enabled.
export const deploymentGuard = (feature: keyof DeploymentCapabilities): CanMatchFn =>
  () => environment.deployment[feature] || inject(Router).parseUrl('/home/device');
