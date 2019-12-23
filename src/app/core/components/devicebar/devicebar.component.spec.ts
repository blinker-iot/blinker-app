import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { DevicebarComponent } from './devicebar.component';

describe('DevicebarComponent', () => {
  let component: DevicebarComponent;
  let fixture: ComponentFixture<DevicebarComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ DevicebarComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(DevicebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
