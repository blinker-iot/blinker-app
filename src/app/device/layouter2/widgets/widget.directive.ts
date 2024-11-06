import { Directive, ElementRef, ViewContainerRef } from '@angular/core';

@Directive({
  selector: '[widget-name]'
})
export class BlinkerWidgetDirective {

  constructor(
    private el: ElementRef,
  ) { }

  ngOnInit() {
    this.el.nativeElement.style['display'] = 'none';
    setTimeout(() => {
      if (this.el.nativeElement.innerText == '') {
        this.el.nativeElement.style['height'] = '0';
      } else {
        this.el.nativeElement.style['height'] = '20px';
      }
      this.el.nativeElement.style['display'] = 'flex';
      setInterval(() => {
        if (this.el.nativeElement.innerText == '') {
          this.el.nativeElement.style['height'] = '0';
        } else {
          this.el.nativeElement.style['height'] = '20px';
        }
      }, 1000);
    }, 20);
  }
}
