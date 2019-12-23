import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { PublicprodevicePage } from './publicprodevice.page';

describe('PublicprodevicePage', () => {
  let component: PublicprodevicePage;
  let fixture: ComponentFixture<PublicprodevicePage>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PublicprodevicePage ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PublicprodevicePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
