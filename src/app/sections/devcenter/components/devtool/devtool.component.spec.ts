import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { DevtoolComponent } from './devtool.component';

describe('DevtoolComponent', () => {
  let component: DevtoolComponent;
  let fixture: ComponentFixture<DevtoolComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ DevtoolComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(DevtoolComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
