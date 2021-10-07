import { Injectable } from '@angular/core';
import { arrayRemove } from '../functions/func';
import { toastOptions } from '../model/toast.model';

@Injectable({
  providedIn: 'root'
})
export class ToastService {

  list: toastOptions[] = []

  constructor() { }

  show(options: toastOptions) {
    if (typeof options.delay == 'undefined') options.delay = 5000;
    this.list.push(options)
    setTimeout(() => {
      arrayRemove(this.list, this.list.indexOf(options))
    }, options.delay + 1000)
  }

  hide() {

  }
}
