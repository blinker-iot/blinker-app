import { Component, ViewChild, ElementRef, Input } from '@angular/core';
import { NavController } from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';
import Sortable from 'sortablejs';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'scene-button-group',
  templateUrl: 'scene-button-group.html',
  styleUrls: ['scene-button-group.scss']
})
export class SceneButtonGroupComponent {

  get sceneDataList() {
    if (typeof this.dataService.scene != 'undefined')
      return this.dataService.scene.list
    return
  }

  @ViewChild("buttonGroup", { read: ElementRef, static: true }) buttonGroup: ElementRef;

  constructor(
    // public userService: UserService
    private dataService: DataService
  ) {
  }

  // ngAfterViewInit() {
  //   this.initSortable();
  // }

  saveButtonListTimer;
  waitSaveButtonList() {
    window.clearTimeout(this.saveButtonListTimer);
  }

  saveButtonList() {
    // let userConfig = {
    //   "sceneButtonList": this.sceneList
    // }
    // this.saveButtonListTimer = window.setTimeout(() => {
    //   this.userService.saveUserConfig(userConfig);
    // }, 3000)
  }

  // sortable;
  // initSortable() {
  //   this.sortable = new Sortable(this.buttonGroup.nativeElement, {
  //     delay: 400,
  //     touchStartThreshold: 3,
  //     animation: 150,
  //     draggable: ".scenebuttonitem",
  //     chosenClass: "sschosen",
  //     dragClass: "ssdrag",
  //     onStart: (event: any) => {
  //       this.waitSaveButtonList();
  //     },
  //     onEnd: (event: any) => {
  //       this.saveButtonList();
  //     },
  //   });
  // }


}
