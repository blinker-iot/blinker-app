import { Component, ElementRef, Input } from '@angular/core';
import { Layouter2Service } from '../layouter2.service';

@Component({
  selector: 'widget-dynamic',
  templateUrl: './parentDynamic.component.html',
  styleUrls: ['parentDynamic.component.scss']
})
export class ParentDynamicComponent {
  @Input()
  widget;
  @Input()
  device;

  public get mode() {
    return this.layouterService.mode
  }

  get color() {
    return this.widget.clr
  }

  constructor(
    private layouterService: Layouter2Service,
    private el: ElementRef
  ) { }

  select() {
    this.layouterService.selectWidget(this.widget, this.el.nativeElement)
  }

}