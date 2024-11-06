import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class NewuiService {

  back = new Subject()

  constructor() { }


  goBack() {
    this.back.next(-1)
  }
}
