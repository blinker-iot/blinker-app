import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { QrscannerPage } from './qrscanner.page';

describe('TestPage', () => {
  let component: QrscannerPage;
  let fixture: ComponentFixture<QrscannerPage>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ QrscannerPage ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(QrscannerPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
