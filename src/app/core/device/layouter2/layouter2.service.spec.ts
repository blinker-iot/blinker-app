import { TestBed } from '@angular/core/testing';

import { Layouter2Service } from './layouter2.service';

describe('Layouter2Service', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: Layouter2Service = TestBed.get(Layouter2Service);
    expect(service).toBeTruthy();
  });
});
