import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'nui-item',
  templateUrl: './item.component.html',
  styleUrls: ['./item.component.scss'],
})
export class ItemComponent implements OnInit {

  @Input() icon = ''
  @Input() title = ''
  @Input() text = ''
  @Input() state = 'undone'

  constructor() { }

  ngOnInit() { }

}
