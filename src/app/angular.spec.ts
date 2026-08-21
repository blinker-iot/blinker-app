import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { routes } from './app.routes';

describe('Angular test environment', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('creates an Angular injector', () => {
    expect(TestBed.inject(Injector)).toBeTruthy();
  });

  it('registers the device detail route', () => {
    const deviceRoute = routes.find((route) => route.path === 'device/:id');

    expect(deviceRoute?.loadComponent).toBeTypeOf('function');
  });

  it('registers each home tab as a lazy child route', () => {
    const homeRoute = routes.find((route) => route.path === 'home');
    const tabRoutes = homeRoute?.children?.filter(
      (route) => route.path && route.path !== '**',
    );

    expect(tabRoutes?.map((route) => route.path)).toEqual([
      'device',
      'community',
      'tools',
      'profile',
    ]);
    expect(tabRoutes?.every((route) => typeof route.loadComponent === 'function'))
      .toBe(true);
  });

  it('does not register Legacy JSON device routes', () => {
    expect(routes.some(route => route.path?.startsWith('device-manager'))).toBe(false);
    expect(routes.some(route => route.path === 'old-device')).toBe(false);
  });
});
