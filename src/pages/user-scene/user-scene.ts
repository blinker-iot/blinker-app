import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { AutoProvider } from '../../providers/auto/auto';
import { arrayRemove } from '../../functions/func';
import { UserProvider } from '../../providers/user/user';

@IonicPage()
@Component({
  selector: 'page-user-scene',
  templateUrl: 'user-scene.html',
})
export class UserScenePage {
  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    public autoProvider: AutoProvider,
    private userProvider: UserProvider
  ) {
  }

  ionViewDidLoad() {
  }

  gotoAddSceneButtonSetting() {
    this.navCtrl.push('SceneEditPage');
  }

  editScene(scene) {
    this.navCtrl.push('SceneEditPage', scene);
  }

  delScene(i) {
    arrayRemove(this.autoProvider.sceneButtonList, i);
    let userConfig = {
      "sceneButtonList": this.autoProvider.sceneButtonList
    }
    this.userProvider.saveUserConfig(userConfig);
  }

}
