import { Component, Input, OnInit } from '@angular/core';

@Component({
    selector: 'nui-bottom-btn',
    templateUrl: './bottom-btn.component.html',
    styleUrls: ['./bottom-btn.component.scss'],
    standalone: false
})
export class BottomBtnComponent implements OnInit {

  @Input() icon = ''
  @Input() title = ''
  @Input() text = ''

  // @Input() willEnterState = false;

  constructor() { }

  ngOnInit() { }

}
