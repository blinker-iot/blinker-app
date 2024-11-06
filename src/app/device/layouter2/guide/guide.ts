import { ChangeDetectorRef, Component, EventEmitter, Output } from '@angular/core';
import { Router } from '@angular/router';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { DataService } from 'src/app/core/services/data.service';
import { Layouter2Service } from '../layouter2.service';

@Component({
  selector: 'layouter2-guide',
  templateUrl: 'guide.html',
  styleUrls: ['guide.scss']
})
export class Layouter2GuidePage {

  @Output() closeGuide = new EventEmitter()

  id: string;
  device: BlinkerDevice

  get dashboard() {
    return this.layouterService.layouterData.dashboard
  }

  showEsptouch = false;
  showExamples = false;

  constructor(
    private dataService: DataService,
    private layouterService: Layouter2Service,
    private router: Router,
    private cd: ChangeDetectorRef
  ) {
  }

  subscription;
  ngOnInit() {
    this.subscription = this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.id = this.router.url.split('/')[2];
        this.device = this.dataService.device.dict[this.id];
      }
    })
  }

  close() {
    this.closeGuide.emit(true)
  }

  index = -1;
  willEnterState = false
  willExitState = false
  willEnter(e) {
    this.willExitState = false
    this.willEnterState = true
    this.cd.detectChanges()
  }

  willExit(e) {
    // console.log('willExit');
    this.willEnterState = false
    this.willExitState = true
    this.cd.detectChanges()
  }

  indexChange(e) {
    // console.log(e);
    this.index = e
  }

}
