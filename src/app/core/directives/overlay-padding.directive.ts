import { Directive, ElementRef, OnInit } from '@angular/core';
import { ViewService } from '../services/view.service';

@Directive({
  selector: '[overlayPadding]',
  exportAs: 'appOverlayPadding'
})
export class StatuabrOverlayPaddingDirective implements OnInit {

  constructor(
    private ele: ElementRef,
    private viewService: ViewService
  ) {
  }

  ngOnInit() {
    this.ele.nativeElement.style.paddingTop = this.viewService.statusBarHeight + 'px';
  }

}
