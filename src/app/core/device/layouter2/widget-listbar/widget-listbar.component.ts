import { Component, OnInit } from '@angular/core';
import { widgetList } from '../widgets/config';
import { ActivatedRoute } from '@angular/router';
import { DeviceService } from 'src/app/core/services/device.service';
import { Events } from '@ionic/angular';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'widget-listbar',
  templateUrl: './widget-listbar.component.html',
  styleUrls: ['./widget-listbar.component.scss']
})
export class WidgetListbarComponent implements OnInit {

  id;
  device;
  // get device() {
  //   return this.deviceService.devices[this.id]
  // }

  get widgetList() {
    return widgetList
  }

  constructor(
    private activatedRoute: ActivatedRoute,
    private dataService: DataService,
    private events: Events,
  ) { }

  ngOnInit(): void {
    this.id = this.activatedRoute.snapshot.params['id'];
    this.device = this.dataService.device.dict[this.id]
  }

  addWidget(type) {
    this.events.publish('layouter2', 'addWidget', type)
  }

}
