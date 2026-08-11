import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { IonicModule, ModalController } from "@ionic/angular";
import { TranslatePipe } from "@ngx-translate/core";
import { MinuteToTimePipe } from "src/app/core/pipes/minute-to-time";
import { ObjToStrPipe } from "src/app/core/pipes/obj-to-str";
import { OwnplugAct2strPipe } from "src/app/core/pipes/ownplug-act2str";
import { MsToDatePipe } from "src/app/core/pipes/ms-to-date";
import { HtmlPipe } from "src/app/core/pipes/html.pipe";
import { WrapPipe } from "src/app/core/pipes/wrap.pipe";
import { Act2TextPipe } from "src/app/core/pipes/actcmd2text";
import { Device2NamePipe } from "src/app/core/pipes/device2name";
import { Days2TextPipe } from "src/app/core/pipes/days2text";
import { DataService } from "src/app/core/services/data.service";
import { TimingEditPage } from "./timing-edit/timing-edit";
import { DeviceService } from "src/app/core/services/device.service";
import { TimerService } from "./timer.service";
import { BActcmdListComponent } from "src/app/core/components/b-actcmd-list/b-actcmd-list.component";
import { BBottomBtnComponent } from "src/app/core/components/b-bottom-btn/b-bottom-btn.component";
import { BChartComponent } from "src/app/core/components/b-chart/b-chart.component";
import { BColorpickerComponent } from "src/app/core/components/b-colorpicker/b-colorpicker";
import { BColorpickerBtnsComponent } from "src/app/core/components/b-colorpicker-btns/b-colorpicker-btns.component";
import { BColorpickerDiscComponent } from "src/app/core/components/b-colorpicker-disc/b-colorpicker-disc.component";
import { BDeviceImgComponent } from "src/app/core/components/b-device-img/b-device-img.component";
import { BDeviceListComponent } from "src/app/core/components/b-device-list/b-device-list.component";
import { BItemListComponent } from "src/app/core/components/b-item-list/b-item-list.component";
import { BItemComponent } from "src/app/core/components/b-item-list/b-item/b-item";
import { BProgressbarComponent } from "src/app/core/components/b-progressbar/b-progressbar.component";
import { BRangeComponent } from "src/app/core/components/b-range/b-range";
import { BTimepickerComponent } from "src/app/core/components/b-timepicker/b-timepicker.component";
import { BTipComponent } from "src/app/core/components/b-tip/b-tip.component";
import { BToastComponent } from "src/app/core/components/b-toast/b-toast.component";
import { BToggleComponent } from "src/app/core/components/b-toggle/b-toggle.component";
import { BTopBoxComponent } from "src/app/core/components/b-top-box/b-top-box.component";
import { DeviceblockList2Component } from "src/app/core/components/deviceblock-list2/deviceblock-list2";
import { LangSelectorComponent } from "src/app/core/components/lang-selector/lang-selector.component";
import { SceneButtonGroupComponent } from "src/app/core/components/scene-button-group/scene-button-group";
import { SceneButtonComponent } from "src/app/core/components/scene-button-group/scene-button/scene-button";
import { RepeatSelectorModalComponent } from "src/app/core/modals/repeat-selector-modal/repeat-selector-modal.component";
import { ActionSelectorModalComponent } from "src/app/core/modals/action-selector-modal/action-selector-modal.component";
import { TimeSelectorModalComponent } from "src/app/core/modals/time-selector-modal/time-selector-modal.component";
import { DeviceSelectorModalComponent } from "src/app/core/modals/device-selector-modal/device-selector-modal.component";
import { SelectorModalComponent } from "src/app/core/modals/selector-modal/selector-modal.component";

@Component({
    selector: "device-timer",
    templateUrl: "./device-timer.page.html",
    styleUrls: ["./device-timer.page.scss"],
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
        Device2NamePipe,
        Days2TextPipe,
        RouterModule,
        TranslatePipe,
        BActcmdListComponent,
        BBottomBtnComponent,
        BChartComponent,
        BColorpickerComponent,
        BColorpickerBtnsComponent,
        BColorpickerDiscComponent,
        BDeviceImgComponent,
        BDeviceListComponent,
        BItemListComponent,
        BItemComponent,
        BProgressbarComponent,
        BRangeComponent,
        BTimepickerComponent,
        BTipComponent,
        BToastComponent,
        BToggleComponent,
        BTopBoxComponent,
        DeviceblockList2Component,
        LangSelectorComponent,
        SceneButtonGroupComponent,
        SceneButtonComponent,
        RepeatSelectorModalComponent,
        ActionSelectorModalComponent,
        TimeSelectorModalComponent,
        DeviceSelectorModalComponent,
        SelectorModalComponent,
    ],
    providers: [TimerService]
})
export class DeviceTimerPage implements OnInit {
  id;
  device;
  editMode = false;

  get deviceDataDict() {
    return this.dataService.device.dict;
  }

  get timingTasks(){
    if (typeof this.device.data.timing == "undefined") {
      return [];
    }
    return this.device.data.timing
  }

  loaded = false;

  constructor(
    private dataService: DataService,
    private activatedRoute: ActivatedRoute,
    public modalCtrl: ModalController,
    public deviceService: DeviceService,
    private timerService: TimerService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.dataService.initCompleted.subscribe((result) => {
      if (result) {
        this.id = this.activatedRoute.snapshot.params["id"];
        this.device = this.dataService.device.dict[this.id];
        this.timerService.loadTask(this.device);
        this.loaded = true;
      }
    });
  }

  trackByFn(index, task) {
    return JSON.stringify(task); // or item.id
  }

  addTimingTask() {
    if (this.device.data.timing?.length > 19) {
      // 超出最大定时任务数
    }

    if (typeof this.device.data.timing == "undefined") {
      this.device.data["timing"] = [];
    }
    let task = {
      "task": this.device.data.timing.length,
      "ena": 1,
      "tim": 0,
      "act": [],
      "day": "0000000",
    };
    this.gotoTimingEditPage(task);
  }

  editTimingTask(task) {
    let editTask = JSON.parse(JSON.stringify(task));
    let actList = [];
    for (let btnAct of editTask.act) {
      actList.push(JSON.stringify(btnAct));
    }
    editTask.act = actList;
    this.gotoTimingEditPage(editTask, "edit");
  }

  async gotoTimingEditPage(task, mode = "new") {
    // let modal = await this.modalCtrl.create({
    //   component: TimingEditPage,
    //   // initialBreakpoint: 0.5,
    //   // breakpoints: [0, 0.5],
    //   componentProps: {
    //     "task": task,
    //     "device": this.device,
    //     "mode": mode,
    //   },
    // });
    // modal.present();
    this.router.navigate([`/device-manager/${this.id}/timer/new`]);
  }

  delTimingTask(task) {
    console.log("delTimingTask");
  }

  getEna(task) {
    return (task.ena == "1" ? true : false);
  }

  changeEna(task) {
    console.log("enaChange:" + task.ena);
    task.ena = task.ena == "1" ? 0 : 1;
    this.updateTask(task);
  }

  updateTask(task) {
    let uploadDate = JSON.parse(JSON.stringify(task));
    let data = {
      set: {
        timing: [],
      },
    };
    data.set.timing.push(uploadDate);
    this.deviceService.sendData(this.device, JSON.stringify(data));
  }
}
