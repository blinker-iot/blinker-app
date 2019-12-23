import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { DatakeyComponent } from './datakey.component';

describe('DatakeyComponent', () => {
  let component: DatakeyComponent;
  let fixture: ComponentFixture<DatakeyComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ DatakeyComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(DatakeyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
