import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { BColorpickerBtnsComponent } from './b-colorpicker-btns.component';

describe('BColorpickerBtnsComponent', () => {
  let component: BColorpickerBtnsComponent;
  let fixture: ComponentFixture<BColorpickerBtnsComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ BColorpickerBtnsComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(BColorpickerBtnsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
