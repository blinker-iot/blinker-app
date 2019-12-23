import { Component, OnInit } from '@angular/core';
import { DevcenterService } from '../../devcenter.service';
import { ActivatedRoute } from '@angular/router';
import { AlertController, NavController } from '@ionic/angular';

@Component({
  selector: 'prodevice-editinfo',
  templateUrl: './editinfo.page.html',
  styleUrls: ['./editinfo.page.scss'],
})
export class EditinfoPage {

  constructor(
    private navCtrl: NavController
  ) { }

  confirm() {
    this.navCtrl.pop()
  }


}

