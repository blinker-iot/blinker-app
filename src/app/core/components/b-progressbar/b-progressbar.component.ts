import { Component, ViewChild, ElementRef, Input, SimpleChanges, ChangeDetectorRef } from '@angular/core';
// import ProgressBar from 'progressbar.js';
// import { Brightness } from '@awesome-cordova-plugins/brightness/ngx';

// var brightness = cordova.plugins.brightness;

@Component({
  selector: 'b-progressbar',
  templateUrl: './b-progressbar.component.html',
  styleUrls: ['./b-progressbar.component.scss'],
})
export class BProgressbarComponent {
  bar;
  @Input() value = 0;
  @Input() text = '正在下载更新...';
  showDone = false;

  get value100() {
    return parseInt((this.value * 100).toString())
  }

  @ViewChild('ProgressBar',{ read: ElementRef, static: true }) progressBar: ElementRef;
  constructor(
    // private changeDetectorRef: ChangeDetectorRef,
    // private brightness: Brightness
  ) { }

  ngOnInit(): void {
    // cordova.plugins.brightness.setKeepScreenOn(true);
  }

  ngOnDestroy(): void {
    // cordova.plugins.brightness.setKeepScreenOn(false);
  }

  ngAfterViewInit(): void {
    // this.bar = new ProgressBar.Circle(this.progressBar.nativeElement, {
    //   strokeWidth: 5,
    //   // easing: 'easeIn',
    //   duration: 1000,
    //   color: '#389BEE',
    //   trailColor: '#eee',
    //   trailWidth: 5,
    //   from: { color: '#389BEE' },
    //   to: { color: '#34AA54' },
    //   step: (state, bar) => {
    //     bar.path.setAttribute('stroke', state.color);
    //     let value = Math.round(bar.value() * 100);
    //     if (value === 0) {
    //       bar.setText(value + '%');
    //     } else if (value === 100) {
    //       bar.setText('');
    //       this.showDone = true;
    //       this.text = '下载完成，即将重启应用'
    //       this.changeDetectorRef.detectChanges();
    //     } else {
    //       bar.setText(value + '%');
    //     }
    //     bar.text.style.color = state.color;
    //   }
    // });
    // this.bar.text.style.fontSize = '1.5rem';
    // setInterval(() => {
    //   this.update()
    // }, 1000);
  }

  update() {
    // this.bar.animate(this.value);
  }

}
