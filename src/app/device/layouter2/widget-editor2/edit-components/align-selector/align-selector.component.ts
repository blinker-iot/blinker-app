import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'align-selector',
  templateUrl: './align-selector.component.html',
  styleUrls: ['./align-selector.component.scss'],
})
export class AlignSelectorComponent implements OnInit {

  @Input() items = [
    {
      value: {
        'justify-content': 'flex-start',
        'align-items': 'flex-start'
      }, icon: 'fa-arrow-up-left'
    },
    {
      value: {
        'justify-content': 'center',
        'align-items': 'flex-start'
      },
      icon: 'fa-arrow-up-to-line'
    },
    {
      value: {
        'justify-content': 'flex-end',
        'align-items': 'flex-start'
      }, icon: 'fa-arrow-up-right'
    },
    {
      value: {
        'justify-content': 'flex-start',
        'align-items': 'center'
      }, icon: 'fa-arrow-left-to-line'
    },
    {
      value: {
        'justify-content': 'center',
        'align-items': 'center'
      }, icon: 'fa-circle'
    },
    {
      value: {
        'justify-content': 'flex-end',
        'align-items': 'center'
      }, icon: 'fa-arrow-right-to-line'
    },
    {
      value: {
        'justify-content': 'flex-start',
        'align-items': 'flex-end'
      }, icon: 'fa-arrow-down-left'
    },
    {
      value: {
        'justify-content': 'center',
        'align-items': 'flex-end'
      }, icon: 'fa-arrow-down-to-line'
    },
    {
      value: {
        'justify-content': 'flex-end',
        'align-items': 'flex-end'
      }, icon: 'fa-arrow-down-right'
    },
  ];
  @Input() selected;
  @Output() selectedChange = new EventEmitter();

  constructor() { }

  ngOnInit() {
    this.items.forEach(item => {
      if (item.value['justify-content'] === this.selected['justify-content'] &&
        item.value['align-items'] === this.selected['align-items']) {
        this.selected = item
      }
    })
  }

  select(item) {
    this.selected = item
    this.selectedChange.emit(this.selected.value)
  }
}
