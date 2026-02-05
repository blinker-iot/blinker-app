import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toastOptions } from '../../model/toast.model';
import { BDeviceImgComponent } from '../b-device-img/b-device-img.component';


@Component({
    standalone: true,
    imports: [CommonModule, BDeviceImgComponent],
    selector: 'b-toast',
    templateUrl: './b-toast.component.html',
    styleUrls: ['./b-toast.component.scss']
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
