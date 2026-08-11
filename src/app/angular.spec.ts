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
});
