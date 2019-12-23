import { Component } from '@angular/core';


@Component({
  selector: 'page-devtool',
  templateUrl: 'devtool.html',
  styleUrls:['devtool.scss']
})
export class DevtoolPage {

  constructor(
    
  ) {
  }

  gotoDevtoolEsptouchPage() {
    // this.navCtrl.push('EsptouchPage', 'diy');
  }

  gotoDevtoolApConfigPage() {
    // this.navCtrl.push('AdddeviceApconfigPage');
  }

}
