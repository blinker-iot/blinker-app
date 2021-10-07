import { Component, OnInit, Input, ViewChildren, QueryList, ElementRef, Output, EventEmitter, ContentChildren } from '@angular/core';
import Sortable from 'sortablejs';
import { BItemComponent } from './b-item/b-item';

@Component({
  selector: 'b-item-list',
  templateUrl: './b-item-list.component.html',
  styleUrls: ['./b-item-list.component.scss'],
})
export class BItemListComponent implements OnInit {

  _editMode = false;
  @Input()
  set editMode(value) {
    if (typeof this.bitems != 'undefined')
    this.bitems.forEach(item => {
      item.editMode = value;
    })
    if (value) {
      if (this.enableSort)
        this.initSortable()
    } else {
      if (this.enableSort)
        this.destroySortable()
    }
    this._editMode = value
  }

  get editMode() {
    return this._editMode
  }

  @Input() enableSort = true;

  @Output() sortChange = new EventEmitter;

  @ViewChildren("sortbox") sortbox: QueryList<ElementRef>;

  @ContentChildren(BItemComponent) bitems: QueryList<BItemComponent>;

  constructor() { }

  ngOnInit() { }

  sortable;
  initSortable() {
    let box = this.sortbox.first;
    if (typeof box == 'undefined') return;
    this.sortable = new Sortable(box.nativeElement, {
      handle: ".handle",
      animation: 150,
      chosenClass: "schosen",
      dragClass: "sdrag",
      dataIdAttr: "sort-id",
      scroll: false,
    });
  }

  destroySortable() {
    if (typeof this.sortable == 'undefined') return
    let array = this.sortable.toArray();
    this.sortable.destroy();
    setTimeout(() => {
      this.sortChange.emit(array)
    }, 500);
  }

}
