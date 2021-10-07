import { Injectable } from '@angular/core';
import { Mode } from './layouter2/layouter2-mode';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LayouterService {
  action: Subject<any> = new Subject;
  mode = Mode.Default;
  gridLength;
  gridMargin;

  updateConfig = new Subject();

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

  changeMode(mode) {
    this.mode = mode
    this.action.next({ name: 'changeMode', data: mode })
  }

  changeBackground(imgData) {
    this.action.next({ name: 'changeBackground', data: imgData })
  }

  cleanWidgets() {
    this.action.next({ name: 'cleanWidgets' })
  }

}
