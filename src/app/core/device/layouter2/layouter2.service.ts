import { Injectable } from '@angular/core';
import { Mode } from './layouter2-mode';

@Injectable({
  providedIn: 'root'
})
export class Layouter2Service {

  mode = Mode.Default;
  gridLength;
  gridMargin;
  constructor(
  ) { }

  init() {

  }

}
