import { Component, Input } from '@angular/core';


@Component({
  selector: 'b-item',
  templateUrl: 'b-item.html',
  styleUrls: ['b-item.scss'],
})
export class BItemComponent {

  @Input() icon;
  @Input() content;
  
  constructor() {
  }

}
