import { Component, ViewChild, ElementRef, Input } from '@angular/core';
import { NavController } from 'ionic-angular';
import { UserProvider } from '../../providers/user/user';
// import Sortable from 'sortablejs';

@Component({
  selector: 'scene-button-group',
  templateUrl: 'scene-button-group.html'
})
export class SceneButtonGroupComponent {
  @Input() scenes = []
  @ViewChild("buttonGroup", { read: ElementRef }) buttonGroup: ElementRef;
  // @ViewChild("buttonGroupBox", { read: ElementRef }) buttonGroupBox: ElementRef;
  constructor(
    public navCtrl: NavController,
    public userProvider: UserProvider
  ) {
  }

  ngAfterViewInit() {
    this.enableSortable();
  }

  addScene() {
    this.navCtrl.push('SceneButtonSettingAddPage');
  }

  saveButtonListTimer;
  waitSaveButtonList() {
    window.clearTimeout(this.saveButtonListTimer);
  }

  saveButtonList() {
    let userConfig = {
      "sceneButtonList": this.scenes
    }
    this.saveButtonListTimer = window.setTimeout(() => {
      this.userProvider.saveUserConfig(userConfig);
    }, 3000)
  }

  sortable;
  enableSortable() {
    // this.sortable = new Sortable(this.buttonGroup.nativeElement, {
    //   delay: 400,
    //   touchStartThreshold: 5,
    //   animation: 150,
    //   draggable: ".scenebuttonitem",
    //   chosenClass: "sschosen",
    //   dragClass: "ssdrag",
    //   onStart: (event: any) => {
    //     this.waitSaveButtonList();
    //   },
    //   onEnd: (event: any) => {
    //     this.saveButtonList();
    //   },
    // });
  }


}
