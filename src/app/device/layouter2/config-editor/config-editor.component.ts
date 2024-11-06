import { Component, ElementRef, Input, ViewChild } from '@angular/core';
// import { LayouterService } from '../../layouter.service';
import { ModalController } from '@ionic/angular';
import { NoticeService } from 'src/app/core/services/notice.service';
import { DeviceService } from 'src/app/core/services/device.service';
import { BlinkerDevice } from 'src/app/core/model/device.model';
// import { Clipboard } from '@awesome-cordova-plugins/clipboard/ngx';
import * as JSONEditor from 'jsoneditor';
import { Layouter2Service } from '../layouter2.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NewuiModule } from '../newui/newui.module';
import { EditComponentsModule } from '../widget-editor2/edit-components/edit-components.module';

@Component({
  selector: 'config-editor',
  templateUrl: './config-editor.component.html',
  styleUrls: ['./config-editor.component.scss'],
  // providers: [Clipboard],
  standalone: true,
  imports: [CommonModule, FormsModule, NewuiModule, EditComponentsModule]
})
export class ConfigEditorComponent {

  @Input() device: BlinkerDevice;

  get layouterData() {
    return this.layouterService.layouterData
  }

  debug(){
    console.log(this.layouterService.layouterData);
  }

  tabIndex = 0;

  @ViewChild('jsoneditor', { read: ElementRef, static: false }) jsoneditorEl: ElementRef;
  jsonEditor;
  layouterDataStr = '';

  constructor(
    private layouterService: Layouter2Service,
    private modalCtrl: ModalController,
    private clipboard: Clipboard,
    private notice: NoticeService,
    private deviceService: DeviceService
  ) { }

  ngOnInit(): void { }

  async selectTab(index) {
    this.tabIndex = index
    let modal = await this.modalCtrl.getTop()
    if (this.tabIndex == 0) {
      modal.setCurrentBreakpoint(0.3)
    } else {
      modal.setCurrentBreakpoint(1)
    }

    if (this.tabIndex == 9) {
      setTimeout(() => {
        this.initJsonEditor()
      }, 50);
    }
  }

  async save() {
    this.layouterService.changeWidget();
    (await this.modalCtrl.getTop()).dismiss()
  }


  async importConfig() {
    let data = JSON.stringify(JSON.parse(this.layouterDataStr))

    let layouterDataConfig = {
      "layouter": data
    }
    this.deviceService.saveDeviceConfig(this.device, layouterDataConfig).then(result => {
      if (result)
        this.notice.showToast('importSuccess')
    });
  }

  addAction() {

  }

  // 配置编辑
  initJsonEditor() {
    this.jsonEditor = new JSONEditor(this.jsoneditorEl.nativeElement, {
      mode: 'code',
      mainMenuBar: false,
      navigationBar: false,
      statusBar: false
    })
    this.jsonEditor.set(this.layouterData)
  }

  copyConfig() {
    let config = this.jsonEditor.get()
    // this.clipboard.copy(JSON.stringify(config));
    this.notice.showToast('copySuccess')
  }
}
