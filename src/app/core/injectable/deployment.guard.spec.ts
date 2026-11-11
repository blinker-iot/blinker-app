import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { CanMatchFn, Router, provideRouter } from '@angular/router';
import { cloudBetaCapabilities, localCapabilities } from 'src/environments/deployment';
import { deploymentGuard } from './deployment.guard';
import { routes } from '../../app.routes';
import { environment } from 'src/environments/environment';

describe('deployment route boundaries', () => {
  const originalDeployment = environment.deployment;
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));
  afterEach(() => { environment.deployment = originalDeployment; TestBed.resetTestingModule(); });

  it('redirects closed feature deep links before constructing their pages', () => {
    environment.deployment = cloudBetaCapabilities;
    const router = TestBed.inject(Router);
    for (const feature of Object.keys(cloudBetaCapabilities) as (keyof typeof cloudBetaCapabilities)[]) {
      const result = TestBed.runInInjectionContext(() => deploymentGuard(feature)({}, [], {} as Parameters<CanMatchFn>[2]));
      expect(router.serializeUrl(result as ReturnType<Router['parseUrl']>)).toBe('/home/device');
    }
  });

  it('preserves explicit local feature access without granting server permission', () => {
    environment.deployment = localCapabilities;
    for (const feature of Object.keys(localCapabilities) as (keyof typeof localCapabilities)[]) {
      expect(deploymentGuard(feature)({}, [], {} as Parameters<CanMatchFn>[2])).toBe(true);
    }
  });

  it.each([false, true])('admits only explicit automation/Task routes (tasks=%s)', tasks => {
    environment.deployment = { ...cloudBetaCapabilities, automation: true, tasks };
    const router = TestBed.inject(Router);
    for (const feature of Object.keys(cloudBetaCapabilities) as (keyof typeof cloudBetaCapabilities)[]) {
      const result = TestBed.runInInjectionContext(() => deploymentGuard(feature)({}, [], {} as Parameters<CanMatchFn>[2]));
      if (feature === 'automation' || (feature === 'tasks' && tasks)) expect(result).toBe(true);
      else expect(router.serializeUrl(result as ReturnType<Router['parseUrl']>), feature).toBe('/home/device');
    }
    for (const path of ['automation-manager', 'message', 'guide/ble', 'guide/wifi',
      'device/:id/gateway-enrollment', 's/:token', 'device-manager/:id/timer', 'device-manager/:id/timer/:taskid']) {
      const route = routes.find(route => route.path === path);
      expect(route?.canMatch?.length, path).toBe(1);
      const result = TestBed.runInInjectionContext(() => (route!.canMatch![0] as CanMatchFn)(route!, [], {} as Parameters<CanMatchFn>[2]));
      if (path === 'automation-manager' || (tasks && path.startsWith('device-manager/:id/timer'))) expect(result).toBe(true);
      else expect(router.serializeUrl(result as ReturnType<Router['parseUrl']>), path).toBe('/home/device');
    }
  });

  it('guards only the closed feature routes, not ordinary control or H1/H2', () => {
    for (const path of ['message', 'automation-manager', 'guide/ble', 'guide/wifi',
      'device/:id/gateway-enrollment', 's/:token', 'device-manager/:id/timer', 'device-manager/:id/timer/:taskid']) {
      const route = routes.find(route => route.path === path);
      expect(route?.canMatch?.length, path).toBe(1);
      environment.deployment = cloudBetaCapabilities;
      const result = TestBed.runInInjectionContext(() => (route!.canMatch![0] as CanMatchFn)(route!, [], {} as Parameters<CanMatchFn>[2]));
      expect(TestBed.inject(Router).serializeUrl(result as ReturnType<Router['parseUrl']>)).toBe('/home/device');
    }
    for (const path of ['guide/key', 'share-manager', 'share-invitation', 'device/:id',
      'device-manager/:id/storage', 'device-manager/:id/trends']) {
      expect(routes.find(route => route.path === path)?.canMatch, path).toBeUndefined();
    }
  });
});
