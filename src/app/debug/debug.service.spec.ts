import { TestBed } from '@angular/core/testing';

import { DebugService } from './debug.service';

describe('DebugService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: DebugService = TestBed.get(DebugService);
    expect(service).toBeTruthy();
  });
});
