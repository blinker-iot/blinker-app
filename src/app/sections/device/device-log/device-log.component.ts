import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { IonicModule } from "@ionic/angular";
import { DirectivesModule } from "src/app/core/directives/directives.module";
import { PipesModule } from "src/app/core/pipes/pipes.module";
import { DataService } from "src/app/core/services/data.service";

@Component({
  selector: "blinker-device-log",
  templateUrl: "./device-log.component.html",
  styleUrls: ["./device-log.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DirectivesModule,
    PipesModule,
  ],
})
export class DeviceLogComponent implements OnInit {
  id;
  device;

  logList = [
    {
      "date": "2020-12-11T08:37:00.000Z",
      "type": "system",
      "data": "设备上线",
    },
    {
      "date": "2020-12-11T08:43:00.000Z",
      "type": "device",
      "data": "启动风扇",
    },    {
      "date": "2020-12-11T08:37:00.000Z",
      "type": "user",
      "data": "设定定时任务",
    },    {
      "date": "2020-12-11T02:37:00.000Z",
      "type": "device",
      "data": "设备上线",
    },    {
      "date": "2020-12-11T08:37:00.000Z",
      "type": "device",
      "data": "设备上线",
    },    {
      "date": "2020-12-11T08:37:00.000Z",
      "type": "device",
      "data": "设备上线",
    },    {
      "date": "2020-12-11T08:37:00.000Z",
      "type": "device",
      "data": "设备上线",
    },    {
      "date": "2020-12-11T08:37:00.000Z",
      "type": "device",
      "data": "设备上线",
    },
  ];

  constructor(
    private dataService: DataService,
    private activatedRoute: ActivatedRoute,
  ) {}

  ngOnInit() {
    this.dataService.initCompleted.subscribe((result) => {
      if (result) {
        this.id = this.activatedRoute.snapshot.params["id"];
        this.device = this.dataService.device.dict[this.id];
      }
    });
  }
}
