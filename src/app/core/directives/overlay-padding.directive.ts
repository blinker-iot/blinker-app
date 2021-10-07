import { Directive, ElementRef, Input, OnInit } from '@angular/core';
import { Platform } from '@ionic/angular';
import { ViewService } from '../services/view.service';
@Directive({
  selector: '[overlayPadding]',
  exportAs: 'appOverlayPadding'
})
export class StatuabrOverlayPaddingDirective implements OnInit {

  subscription;

  constructor(
    private ele: ElementRef,
    private platform: Platform,
    private viewService: ViewService
  ) {
  }

  ngOnInit() {
    this.setPaddingTop();
  }

  setPaddingTop() {
    this.subscription = this.viewService.statusBarHeight.subscribe(value => {
      if (value != 0) {
        this.ele.nativeElement.style.paddingTop = value + 'px';
      }
    })
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

}
