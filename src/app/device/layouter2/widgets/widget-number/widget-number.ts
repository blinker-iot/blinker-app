import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  SimpleChanges,
  ViewChild,
} from "@angular/core";
import { Layouter2Widget } from "../config";
import { convertToRgba } from "src/app/core/functions/func";
import { Layouter2Service } from "../../layouter2.service";

@Component({
  selector: "widget-number",
  templateUrl: "widget-number.html",
  styleUrls: ["widget-number.scss"],
})
export class WidgetNumberComponent implements Layouter2Widget {
  @Input()
  widget;
  @Input()
  device;

  oldLstyle;

  get key() {
    return this.widget.key;
  }

  get tex() {
    return this.getValue(["tex", "t0"]);
  }

  get ico() {
    return this.getValue(["ico", "icon"]);
  }

  get color() {
    return this.getValue(["clr", "col", "color"]);
  }

  get value() {
    let val = this.getValue(["val", "value"]);
    if (typeof val == "undefined") {
      return 0;
    }
    try {
      if ((val.toString()).indexOf(".") > -1) {
        return Math.floor(val * 100) / 100;
      }
    } catch (error) {
    }
    return val;
  }

  get unit() {
    return this.getValue(["uni", "unit"]);
  }

  get min() {
    return this.getValue(["min"]);
  }

  get max() {
    return this.getValue(["max"]);
  }

  setValue(valueKey, value) {
    if (typeof this.device.data[this.key] == "undefined") {
      this.device.data[this.key] = {};
    }
    this.device.data[this.key][valueKey] = value;
  }

  getValue(valueKeys: string[]): any {
    for (let valueKey of valueKeys) {
      if (typeof this.device.data[this.key] != "undefined") {
        if (typeof this.device.data[this.key][valueKey] != "undefined") {
          return this.device.data[this.key][valueKey];
        }
      }
      if (typeof this.widget[valueKey] != "undefined") {
        return this.widget[valueKey];
      }
    }
    return;
  }

  _lstyle;
  @Input()
  set lstyle(lstyle) {
    this._lstyle = lstyle;
  }
  get lstyle() {
    if (typeof this._lstyle != "undefined") {
      return this._lstyle;
    }
    if (typeof this.widget.lstyle != "undefined") {
      return this.widget.lstyle;
    }
    return 0;
  }

  get is2Long() {
    if (this.value.toString().length >= 4) return true;
    return false;
  }

  get valuePer() {
    return Number(((this.value - this.min) / (this.max - this.min)).toFixed(2));
  }

  scale = 1;
  fontScale = `scale(${this.scale})`;
  elWidth;

  constructor(
    private cd: ChangeDetectorRef,
    private el: ElementRef,
    private LayouterService: Layouter2Service
  ) { }

  ngAfterViewInit() {
    if (this.myCanvas) {
      this.initProgressBar();
    }
    this.intervalTimer = setInterval(() => {
      this.listenWidth();
      if (this.myCanvas) {
        this.drawProgressBar(this.currentPercent, this.valuePer);
      }
    }, 1100);
    setTimeout(() => {
      this.elWidth = this.el.nativeElement.getBoundingClientRect().width;
      if (this.widget.sty == 2) {
        this.elWidth = this.elWidth /2;
      }
      this.initStyle();
    }, 500);

    // 监听组件配置改变
    this.LayouterService.changeWidgetSubject.subscribe((widget: any) => {
      if (widget.key == this.widget.key) {
        this.initStyle()
      }
    });
  }

  ngOnDestroy() {
    clearInterval(this.intervalTimer);
  }

  ngOnChanges(changes: SimpleChanges): void {
  }

  currentPercent = 0;
  intervalTimer;
  @ViewChild("myCanvas")
  myCanvas: ElementRef;
  initProgressBar() {
    this.drawProgressBar(0, this.valuePer);
  }

  drawProgressBar(
    startPercent: number,
    targetPercent: number,
    opts: { lineWidth?} = { lineWidth: 5 },
  ) {
    this.currentPercent = startPercent;
    var canvas: any = this.myCanvas.nativeElement;
    var ctx = canvas.getContext("2d");
    // 清除canvas内容
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 画底色圆环
    var centerX = canvas.width / 2;
    var centerY = canvas.height / 2;
    var radius = Math.min(centerX, centerY) - opts.lineWidth / 2;
    var startAngle = -0.5 * Math.PI; // 开始于顶部
    var endAngle = startAngle + 2 * Math.PI; // 全圆

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.lineWidth = opts.lineWidth;
    ctx.strokeStyle = convertToRgba(this.color, 0.2);
    ctx.stroke();

    // 画圆形进度条
    var centerX = canvas.width / 2;
    var centerY = canvas.height / 2;
    var radius = Math.min(centerX, centerY) - opts.lineWidth / 2;
    var startAngle = -0.5 * Math.PI; // 开始于顶部
    var endAngle = startAngle + 2 * Math.PI * startPercent; // 根据百分比计算结束角度

    ctx.beginPath();
    ctx.lineCap = "round"; // 线两端呈现圆形
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.lineWidth = opts.lineWidth;
    ctx.strokeStyle = this.color;
    ctx.stroke();

    var nextPercent;
    if (startPercent < targetPercent) {
      nextPercent = startPercent + 0.01;
      if (nextPercent > targetPercent) nextPercent = targetPercent;
      requestAnimationFrame(() => {
        this.drawProgressBar(nextPercent, targetPercent);
      });
    } else if (startPercent > targetPercent) {
      nextPercent = startPercent - 0.01;
      if (nextPercent < targetPercent) nextPercent = targetPercent;
      requestAnimationFrame(() => {
        this.drawProgressBar(nextPercent, targetPercent);
      });
    }
  }

  // 检测.s2的宽度，如果宽度超过组件宽度，就使用transform: scale()缩小元素
  listenWidth() {
    let s2 = this.el.nativeElement.querySelector(".s2");
    if (s2) {
      let s2Width = s2.getBoundingClientRect().width;
      // console.log('s2Width:', s2Width,'this.elWidth:', this.elWidth);
      // console.log(s2Width > this.elWidth);
      // console.log(this.scale);


      if (s2Width > this.elWidth) {
        this.scale = this.elWidth / s2Width;
        this.fontScale = `scale(${this.scale})`;
        this.cd.detectChanges();
      } else if (s2Width < this.elWidth && this.scale !== 1) {
        this.scale = 1;
        this.fontScale = `scale(${this.scale})`;
        this.cd.detectChanges();
      }
    }
  }

  translateX = `translateX(0px)`;

  initStyle() {
    if (this.widget.sty == 0) {
      this.translateX = `translateX(0px)`;
    } else if (this.widget.sty == 1) {
      this.translateX = `translateX(-${this.elWidth}px)`;
    }
  }


  // lock = false;
  switchStyle() {
    if (this.widget.sty == 2) return;
    // this.lock = true;
    if (this.translateX == 'translateX(0px)') {
      this.translateX = `translateX(-${this.elWidth}px)`;
    } else {
      this.translateX = `translateX(0px)`;
    }
  }
}
