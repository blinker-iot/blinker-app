import { Component, OnInit, Input, Output, EventEmitter, HostListener } from '@angular/core';

@Component({
  selector: 'b-toggle',
  templateUrl: './b-toggle.component.html',
  styleUrls: ['./b-toggle.component.scss'],
})
export class BToggleComponent implements OnInit {

  @Input() color = "#389bee";
  // @Input() state: any = 'on'
  @Input() switch: any = true
  @Output() stateChange = new EventEmitter()

  // @HostListener('click', ['$event.target'])
  // public onClick(targetElement) {
  //   if (this.state == 'on')
  //     this.state = 'off'
  //   else
  //     this.state = 'on'
  //   this.stateChange.emit(this.state)
  // }


  constructor() { }

  ngOnInit() { }

}
