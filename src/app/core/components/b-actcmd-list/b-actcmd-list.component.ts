import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { widgetButtonListComponent } from 'src/app/device/layouter2/widget-buttonlist/widget-buttonlist';

@Component({
  selector: 'b-actcmd-list',
  standalone: true,
  imports: [widgetButtonListComponent],
  templateUrl: './b-actcmd-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./b-actcmd-list.component.scss'],
})
export class BActcmdListComponent {
  @Input() device;
  @Output() updateAct = new EventEmitter();

  selectedItem;

  updateSelectedAction(event) {
    this.selectedItem = event[0];
    if (typeof event[0] == 'string') this.updateAct.emit([event[0]]);
    else this.updateAct.emit([JSON.stringify(event[0])]);
  }
}
