import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DataService } from 'src/app/core/services/data.service';


@Component({
  selector: 'page-device-ieconfig',
  templateUrl: 'device-ieconfig.html',
  styleUrls: ['device-ieconfig.scss']
})
export class DeviceIeconfigPage {
  id;
  device;

  constructor(
    private activatedRoute: ActivatedRoute,
    private dataService: DataService
  ) { }

  ngOnInit(): void {
    this.id = this.activatedRoute.snapshot.params['id'];
    this.device = this.dataService.device.dict[this.id]
  }

}
