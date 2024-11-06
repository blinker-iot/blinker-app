import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { DataService } from 'src/app/core/services/data.service';
import { DeviceService } from 'src/app/core/services/device.service';
import { Layouter2Service } from '../../layouter2.service';
import { NewuiService } from '../../newui/newui.service';

@Component({
  selector: 'blinker-guide-examples',
  templateUrl: './examples.component.html',
  styleUrls: ['./examples.component.scss'],
})
export class ExamplesComponent implements OnInit {

  id: string;
  device: BlinkerDevice;

  templateList = []


  selected;

  constructor(
    private newuiService: NewuiService,
    private dataService: DataService,
    private activatedRoute: ActivatedRoute,
    private deviceService: DeviceService,
    private layouterService: Layouter2Service,
    private changeDetectorRef: ChangeDetectorRef
  ) { }

  subscription;
  ngOnInit() {
    this.subscription = this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.id = this.activatedRoute.snapshot.params['id'];
        this.device = this.dataService.device.dict[this.id]
      }
    })
    this.layouterService.getTemplateList().subscribe((data: any) => {
      this.templateList = data
      this.changeDetectorRef.detectChanges()
    })
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  select(e) {
    this.selected = e
  }

  loadExample(item) {
    let layouterData = JSON.stringify(item);
    let layouterDataConfig = {
      "layouter": layouterData
    }
    this.deviceService.saveDeviceConfig(this.device, layouterDataConfig).then(result => {
      this.device.config['layouter'] = layouterData;
      this.layouterService.init(this.device)
    });
  }

  done() {
    this.loadExample(this.selected.data)
    this.newuiService.goBack()
  }
}
