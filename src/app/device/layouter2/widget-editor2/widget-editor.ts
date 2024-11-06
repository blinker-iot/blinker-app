import { Component, Renderer2, Input, ViewChild, ElementRef } from '@angular/core';
import { ModalController, Platform } from '@ionic/angular';
import { IconListPage } from 'src/app/core/pages/icon-list/icon-list';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { Layouter2Service } from '../layouter2.service';
import * as JSONEditor from 'jsoneditor';

@Component({
  selector: 'widget-editor',
  templateUrl: 'widget-editor.html',
  styleUrls: ['widget-editor.scss']
})
export class WidgetEditor {

  @Input() widget;
  @Input() dom;
  @Input() device: BlinkerDevice;

  tabIndex = 0;

  @ViewChild('settingContent') settingContent: ElementRef
  keyboardPadding = 0;

  @ViewChild('jsoneditor', { read: ElementRef, static: false }) jsoneditorEl: ElementRef;
  jsonEditor;

  constructor(
    private modalCtrl: ModalController,
    private renderer: Renderer2,
    private platform: Platform,
    private LayouterService: Layouter2Service
  ) { }

  ngOnInit() {

  }

  ngAfterViewInit() {
    let inputEls = this.settingContent.nativeElement.getElementsByTagName('input')
    // console.log(inputEls);
    for (let i = 0; i < inputEls.length; i++) {
      let el = inputEls[i]
      el.onfocus = () => {
        // console.log(el, 'focus');
        this.keyboardPadding = 400
      }
    }

    if (this.platform.is('android')) {
      this.listenKeyboard();
    }
  }

  selectTab(e) {
    this.tabIndex = e
    if (this.tabIndex == 9) {
      setTimeout(() => {
        this.initJsonEditor()
      }, 50);
    }
  }

  async save() {
    this.LayouterService.changeWidget();
    (await this.modalCtrl.getTop()).dismiss()
  }

  async changeIcon() {
    let modal = await this.modalCtrl.create({
      component: IconListPage,
      componentProps: {
        'item': this.widget
      }
    });
    modal.present();
  }

  async selectIcon(iconId) {
    let modal = await this.modalCtrl.create({
      component: IconListPage,
      componentProps: {
        'item': this.widget,
        'iconId': iconId
      }
    });
    modal.present();
  }

  showKeyboard = false;
  listenKeyboardShow;
  listenKeyboardHide;
  listenKeyboard() {
    this.listenKeyboardShow = this.renderer.listen('window', 'native.keyboardshow', e => {
      this.showKeyboard = true;
    });
    this.listenKeyboardHide = this.renderer.listen('window', 'native.keyboardhide', e => {
      this.showKeyboard = false;
      this.keyboardPadding = 0;
    });
  }

  unlistenKeyboard() {
    if (typeof (this.listenKeyboardShow) === 'function') this.listenKeyboardShow();
    if (typeof (this.listenKeyboardHide) === 'function') this.listenKeyboardHide();
  }

  initJsonEditor() {
    this.jsonEditor = new JSONEditor(this.jsoneditorEl.nativeElement, {
      mode: 'code',
      mainMenuBar: false,
      navigationBar: false,
      statusBar: false,
      onChange: () => {
        this.widget = this.jsonEditor.get();
      }
    })
    this.jsonEditor.set(this.widget)
  }

}
