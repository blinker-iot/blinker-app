import {
  Component,
  ViewChildren,
  QueryList,
  ElementRef,
} from '@angular/core';
import {
  AlertController,
  Events,
} from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';
import { Router } from '@angular/router';
import Sortable from 'sortablejs';
import { DataService } from 'src/app/core/services/data.service';
import { SceneService } from '../scene.service';


@Component({
  selector: 'scene-manager',
  templateUrl: 'scene-manager.html',
  styleUrls: ['scene-manager.scss']
})
export class SceneManagerPage {

  @ViewChildren("sortbox") sortbox: QueryList<ElementRef>;

  loaded = false;

  alert;
  editMode = false;
  oldSceneListData;

  get sceneData() {
    return this.dataService.scene
  }

  get sceneDataList() {
    return this.dataService.scene.list
  }

  set sceneDataList(list) {
    this.dataService.scene.list = list
  }

  get sceneDataDict() {
    return this.dataService.scene.dict
  }


  constructor(
    private sceneService: SceneService,
    private dataService: DataService,
    public alertCtrl: AlertController,
    public events: Events,
    private router: Router
  ) {
  }

  ngOnInit() {
    this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.loaded = loaded
        this.oldSceneListData = JSON.stringify(this.sceneData)
      }
    })
  }

  // 退出页面时保存数据
  ngOnDestroy() {
    if (this.oldSceneListData == JSON.stringify(this.sceneData)) return;
    this.saveConfig();
  }

  switchMode() {
    this.editMode = !this.editMode;
    if (this.editMode) {
      setTimeout(() => {
        this.initSortable()
      }, 100);
    } else {
      this.destroySortable()
    }
  }

  async addScene() {
    // if (typeof this.userService.sceneList.order != 'undefined')
    if (this.sceneDataList.length > 98) {
      this.events.publish('provider:notice', 'tooManyScenes')
      return;
    }
    this.alert = await this.alertCtrl.create({
      header: '新建场景',
      subHeader: '请设置新场景名称',
      inputs: [{ name: 'newSceneName', value: '新的场景', placeholder: '新的场景' }],
      buttons: [
        {
          text: '取消', handler: data => {
            console.log('Cancel clicked')
          }
        },
        {
          text: '确认', handler: data => {
            if (data.newSceneName.length == 0) return;
            if (data.newSceneName.length > 10) {
              this.events.publish('provider:notice', 'tooLongSceneName')
              return;
            }
            if (this.sceneIsExist(data.newSceneName)) {
              this.events.publish('provider:notice', 'sameSceneName')
              return;
            }
            this.newScene(data.newSceneName);
            this.editScene(data.newSceneName);
          }
        }
      ]
    });
    this.alert.present();
  }

  editScene(sceneName) {
    // this.navCtrl.push('SceneEditPage', sceneName)
    this.router.navigate(['/scene-manager', sceneName])
  }

  sceneIsExist(sceneName) {
    if (this.sceneDataList.indexOf(sceneName) > -1) return true;
    return false
  }

  newScene(sceneName) {
    this.sceneDataList.push(sceneName);
    this.sceneDataDict[sceneName] = {
      ico: "fal fa-question-circle",
      acts: [
        // { devicename: "30AEA4244BF4ORZ88QHTJRRC", content: "开灯", key: "tog-abc", value: "on" },
        // { devicename: "30AEA4244BF4ORZ88QHTJRRB", content: "开灯", key: "tog-abc", value: "on" },
        // { devicename: "30AEA4244BF4ORZ88QHTJRRA", content: "开灯", key: "tog-abc", value: "on" },
        // { devicename: "30AEA4244BF4ORZ88QHTJRRD", content: "开灯", key: "tog-abc", value: "on" },
      ]
    }
  }

  async delSceneAlert(sceneName) {
    this.alert = await this.alertCtrl.create({
      header: '确定要删除该场景？',
      subHeader: '删除后可重新添加',
      buttons: [
        {
          text: '取消', handler: data => {
            console.log('Cancel clicked')
          }
        },
        {
          text: '确认', handler: data => {
            this.delScene(sceneName)
          }
        }
      ]
    });
    this.alert.present();
  }

  delScene(sceneName) {
    let index = this.sceneDataList.indexOf(sceneName);
    if (index > -1) {
      this.sceneDataList.splice(index, 1);
    }
    delete this.sceneDataDict[sceneName]
  }

  sortable;
  initSortable() {
    let box = this.sortbox.first;
    // let box = this.content.getNativeElement()
    if (typeof box == 'undefined') return;
    console.log("init Sortablejs");
    this.sortable = new Sortable(box.nativeElement, {
      handle: ".handle",
      animation: 150,
      chosenClass: "schosen",
      dragClass: "sdrag",
      dataIdAttr: "id",
      scroll: false,
    });
  }

  destroySortable() {
    this.sceneDataList = this.sortable.toArray();
    this.sortable.destroy();
  }

  saveConfig() {
    this.sceneService.saveData(this.sceneData);
  }

}
