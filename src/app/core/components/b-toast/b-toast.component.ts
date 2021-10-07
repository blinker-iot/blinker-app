import { Component, OnInit, Input } from '@angular/core';
import { toastOptions } from '../../model/toast.model';


@Component({
  selector: 'b-toast',
  templateUrl: './b-toast.component.html',
  styleUrls: ['./b-toast.component.scss'],
})
export class BToastComponent implements OnInit {

  @Input() toast: toastOptions;

  hide = false;

  constructor() { }

  ngOnInit() {
    setTimeout(() => {
      setTimeout(() => {
        this.close()
      }, this.toast.delay)
    }, 100)
  }

  close() {
    this.hide = true;
  }

}
