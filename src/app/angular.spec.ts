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
