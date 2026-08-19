import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LayouterService {
  action: Subject<any> = new Subject;
  gridLength;
  gridMargin;

  updateConfig = new Subject<void>();

  constructor(
  ) { }

  init() {

  }

  changeWidget() {
    this.action.next({ name: 'changeWidget' })
  }

  delWidget(widget) {
    this.action.next({ name: 'delWidget', data: widget })
  }

  refreshWidget(widget) {
    this.action.next({ name: 'refreshWidget', data: widget })
  }

  send(data) {
    this.action.next({ name: 'send', data: data })
  }

  addWidget(data) {
    this.action.next({ name: 'addWidget', data: data })
  }

}
