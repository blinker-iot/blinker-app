import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'check-list',
  templateUrl: './check-list.component.html',
  styleUrls: ['./check-list.component.scss'],
})
export class CheckListComponent implements OnInit {

  @Input() items;

  @Input() selected;
  @Output() selectedChange = new EventEmitter();

  @Input() radio = false

  constructor() { }

  ngOnInit() { }

  select(item) {
    if (this.radio) {
      this.selected = item.value
    } else {
      this.selected = this.selected.includes(item.value) ? this.selected.filter(i => i !== item.value) : [...this.selected, item.value]
    }
    this.selectedChange.emit(this.selected)
  }

  isSelected(item) {
    if (this.radio)
      return this.selected == item.value
    return this.selected.includes(item.value)
  }
}
