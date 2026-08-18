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

  it('registers the device timer routes', () => {
    const timerRoute = routes.find(
      (route) => route.path === 'device-manager/:id/timer',
    );
    const timerEditRoute = routes.find(
      (route) => route.path === 'device-manager/:id/timer/:taskid',
    );

    expect(timerRoute?.loadComponent).toBeTypeOf('function');
    expect(timerEditRoute?.loadComponent).toBeTypeOf('function');
  });
});
