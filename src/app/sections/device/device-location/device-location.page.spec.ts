import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { DeviceLocationPage } from './device-location.page';

describe('DeviceLocationPage', () => {
  let component: DeviceLocationPage;
  let fixture: ComponentFixture<DeviceLocationPage>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ DeviceLocationPage ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(DeviceLocationPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
