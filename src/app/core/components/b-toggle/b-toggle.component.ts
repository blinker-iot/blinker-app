import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  HostListener,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'b-toggle',
  templateUrl: './b-toggle.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./b-toggle.component.scss'],
})
export class BToggleComponent implements OnInit {
  @Input() color = '#389bee';
  // @Input() state: any = 'on'
  @Input() switch: any = true;
  @Output() stateChange = new EventEmitter();

  // @HostListener('click', ['$event.target'])
  // public onClick(targetElement) {
  //   if (this.state == 'on')
  //     this.state = 'off'
  //   else
  //     this.state = 'on'
  //   this.stateChange.emit(this.state)
  // }

  constructor() {}

  ngOnInit() {}
}
