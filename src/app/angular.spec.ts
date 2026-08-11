import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';

describe('Angular test environment', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('creates an Angular injector', () => {
    expect(TestBed.inject(Injector)).toBeTruthy();
  });
});
