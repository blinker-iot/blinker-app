import { Component, Input, OnInit } from '@angular/core';
import { tipOptions } from '../../model/tip.model';

@Component({
  selector: 'b-tip',
  templateUrl: './b-tip.component.html',
  styleUrls: ['./b-tip.component.scss'],
})
export class BTipComponent implements OnInit {
  @Input() tip: tipOptions;

  hide = false;

  constructor() { }

  ngOnInit() {
    setTimeout(() => {
      setTimeout(() => {
        this.close()
      }, this.tip.delay)
    }, 100)
  }


  close() {
    this.hide = true;
  }
}
