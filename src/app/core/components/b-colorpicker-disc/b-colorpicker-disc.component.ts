import {
  Component,
  ViewChild,
  ElementRef,
  Renderer2,
  ChangeDetectorRef,
  Input,
  Output,
  EventEmitter
} from '@angular/core';


@Component({
  selector: 'b-colorpicker-disc',
  templateUrl: './b-colorpicker-disc.component.html',
  styleUrls: ['./b-colorpicker-disc.component.scss']
})
export class BColorpickerDiscComponent {

  @Output() colorChange = new EventEmitter();
  @Output() sendData = new EventEmitter();

  _lstyle = 0;
  @Input()
  set lstyle(lstyle) {
    if (this.loaded)
      this.loadColorImg();
    this._lstyle = lstyle;
  }
  get lstyle() {
    return this._lstyle
  }

  @Input() enableWhite = false;

  _color;
  @Input()
  set color(color) {
    // this.renderer.setStyle(this.picker.nativeElement, 'background-color', color);
    this.rgbStr = color;
    this._color = color;
  }
  get color() {
    return this._color;
  }
  brightness;

  gesture;
  loaded = false;

  // @ViewChild('picker', { read: ElementRef, static: true }) picker: ElementRef;
  @ViewChild('pickerbox', { read: ElementRef, static: true }) pickerbox: ElementRef;
  @ViewChild('knob', { read: ElementRef, static: true }) knob: ElementRef;

  value = 0;

  imgsize = 2;

  constructor(
    private renderer: Renderer2,
    public changeDetectorRef: ChangeDetectorRef,
  ) {
  }

  ngAfterViewInit() {
    this.loadColorImg();
    this.loaded = true;
  }

  processData(data) {
    if (typeof data != "undefined") {
      if (data instanceof Array) {
        if (data.length < 3) return;
        let col = data.length == 3 ? 'rgb(' : 'rgba(';
        for (var i = 0; i < 3; i++) {
          col = col + `${data[i].toString()},`
        }
        if (data.length == 3) {
          col = col.substr(0, col.length) + ")";
        } else {
          col = col + `${(data[3] / 255).toString()})`;
          this.brightness = data[3];
          this.value = data[3];
        }
        // console.log("获得颜色：" + col);
        this.color = col;
      }
    }
  }

  getKnob(e) {
    let rect = this.pickerbox.nativeElement.getBoundingClientRect();
    let r = (rect.right - rect.left) / 2;
    let centerX = rect.left + r;
    let centerY = rect.top + r;

    let x = e.center.x;
    let y = e.center.y;

    let x1 = x - rect.left;
    let y1 = y - rect.top;

    let currentR = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2))
    let z = r / currentR * 0.95

    if (currentR > r) {
      x1 = (x - centerX) * z + centerX - rect.left;
      y1 = (y - centerY) * z + centerY - rect.top;
    }
    this.renderer.setStyle(this.knob.nativeElement, 'left', `${(x1 - 20).toString()}px`);
    this.renderer.setStyle(this.knob.nativeElement, 'top', `${(y1 - 20).toString()}px`);
    this.pick(x1, y1);
  }

  tapEvent(e) {
    this.getKnob(e);
    this.sendDataAtEnd();
  }

  panstartEvent(e) {
    this.renderer.setStyle(this.knob.nativeElement, 'opacity', '1')
    this.getKnob(e);
  }

  panmoveEvent(e) {
    this.getKnob(e);
  }

  panendEvent(e) {
    this.renderer.setStyle(this.knob.nativeElement, 'opacity', '0')
    this.getKnob(e);
    this.sendDataAtEnd();
  }

  // valueChange(value) {
  //   this.value = value;
  //   this.rgbStr = `rgba(${this.rgb[0]},${this.rgb[1]},${this.rgb[2]},${this.value / 255})`
  //   this.renderer.setStyle(this.picker.nativeElement, 'background-color', this.rgbStr);
  //   this.changeDetectorRef.detectChanges();
  // }

  context;
  image;
  @ViewChild("myCanvas", { read: ElementRef, static: true }) myCanvas;
  length;
  loadColorImg() {
    this.context = this.myCanvas.nativeElement.getContext("2d");
    this.image = new Image();
    if (this.enableWhite) this.image.src = `assets/img/layouter/colorpicker.png`;
    else this.image.src = `assets/img/devices/ownlight/colorpicker.png`;
    this.image.onload = () => {
      window.setTimeout(() => {
        this.length = this.pickerbox.nativeElement.clientHeight;
        this.renderer.setAttribute(this.myCanvas.nativeElement, 'width', `${this.length * this.imgsize}`);
        this.renderer.setAttribute(this.myCanvas.nativeElement, 'height', `${this.length * this.imgsize}`);
        this.renderer.setStyle(this.knob.nativeElement, 'top', `${this.length / 2 - 20}px`)
        this.renderer.setStyle(this.knob.nativeElement, 'left', `${this.length / 2 - 20}px`)
        this.context.drawImage(this.image, 0, 0, this.length * this.imgsize, this.length * this.imgsize);
      }, 50);
      // this.context.drawImage(this.image, 0, 0, length, length);

    }
  }

  lastSendColor = '';
  rgb = [255, 255, 255];
  rgbStr = '#e6e6e6';
  pick(x, y) {
    // console.log(x, y);
    let temp = this.context.getImageData(x * this.imgsize, y * this.imgsize, 1, 1).data;
    this.rgb = [temp[0], temp[1], temp[2]];
    let rgbString = this.rgb.toString();
    if (rgbString != this.lastSendColor) {
      this.lastSendColor = rgbString;
      this.rgbStr = `rgb(${this.rgb[0]},${this.rgb[1]},${this.rgb[2]})`
      // this.renderer.setStyle(this.picker.nativeElement, 'background-color', this.rgbStr);
      this.changeDetectorRef.detectChanges();
      this.pickend();
    }
  }

  canSend = false;
  pickend() {
    this.colorChange.emit(this.rgb);
  }

  sendDataAtEnd() {
    // console.log(this.rgb);
    this.colorChange.emit(this.rgb);
    this.sendData.emit(this.rgb);
  }


}
