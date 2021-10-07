import { Component, Input, Output, EventEmitter, HostBinding } from '@angular/core';

@Component({
  selector: 'b-item',
  templateUrl: 'b-item.html',
  styleUrls: ['b-item.scss'],
})
export class BItemComponent {

  @Input() icon;
  @Input() content;
  @Input() height = 60;
  @Input() id;

  @Input() editMode = false;

  @Input() showArrow = false;
  @Input() disabled = false;

  @Output() delete = new EventEmitter;
  @Output() enter = new EventEmitter;

  @HostBinding('attr.sort-id') get sortId() { return this.id };

  get itemHeight() {
    if (this.height == 0) return 'auto'
    return `${this.height}px`
  }

  constructor() {
  }

  clickDelBtn() {
    this.delete.emit(this.id);
  }

  clickItem() {
    if (!this.editMode) this.enter.emit()
  }

}
