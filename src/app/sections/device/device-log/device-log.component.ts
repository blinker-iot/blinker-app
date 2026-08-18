import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { IonicModule } from "@ionic/angular";
import { MinuteToTimePipe } from "src/app/core/pipes/minute-to-time";
import { ObjToStrPipe } from "src/app/core/pipes/obj-to-str";
import { OwnplugAct2strPipe } from "src/app/core/pipes/ownplug-act2str";
import { MsToDatePipe } from "src/app/core/pipes/ms-to-date";
import { HtmlPipe } from "src/app/core/pipes/html.pipe";
import { WrapPipe } from "src/app/core/pipes/wrap.pipe";
import { Act2TextPipe } from "src/app/core/pipes/actcmd2text";
import { Days2TextPipe } from "src/app/core/pipes/days2text";
import { DataService } from "src/app/core/services/data.service";

@Component({
    selector: "blinker-device-log",
    templateUrl: "./device-log.component.html",
    styleUrls: ["./device-log.component.scss"],
    imports: [
        CommonModule,
        FormsModule,
        IonicModule,
        MinuteToTimePipe,
        ObjToStrPipe,
        OwnplugAct2strPipe,
        MsToDatePipe,
        HtmlPipe,
        WrapPipe,
        Act2TextPipe,
        Days2TextPipe,
    ]
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
