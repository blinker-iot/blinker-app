import { Injectable } from '@angular/core';
import { arrayRemove } from '../functions/func';
import { tipOptions } from '../model/tip.model';

@Injectable({
  providedIn: 'root'
})
export class TipService {

  list: tipOptions[] = []

  constructor() { }

  show(options: tipOptions) {
    if (typeof options.delay == 'undefined') options['delay'] = 5000;
    this.list.push(options)
    setTimeout(() => {
      arrayRemove(this.list, this.list.indexOf(options))
    }, options.delay + 1000)
    console.log(this.list);
    
  }

  hide() {

  }
}
