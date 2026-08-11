import {
  Component,
  Input,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { tipOptions } from '../../model/tip.model';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'b-tip',
  templateUrl: './b-tip.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./b-tip.component.scss'],
})
export class BTipComponent implements OnInit {
  @Input() tip: tipOptions;

  hide = false;

  constructor() {}

  ngOnInit() {
    setTimeout(() => {
      setTimeout(() => {
        this.close();
      }, this.tip.delay);
    }, 100);
  }

  close() {
    this.hide = true;
  }
}
