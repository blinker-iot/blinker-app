import { Injectable } from '@angular/core';
import { Mode } from './layouter2/layouter2-mode';
import { BehaviorSubject, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LayouterService {
  action: Subject<any> = new Subject;
  private readonly modeSubject = new BehaviorSubject<Mode>(Mode.Default);
  readonly modeChanges = this.modeSubject.asObservable();

  get mode(): Mode {
    return this.modeSubject.value;
  }
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

  changeMode(mode: Mode) {
    this.modeSubject.next(mode)
    this.action.next({ name: 'changeMode', data: mode })
  }

  resetMode() {
    this.modeSubject.next(Mode.Default)
  }

  cleanWidgets() {
    this.action.next({ name: 'cleanWidgets' })
  }

}
