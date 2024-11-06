import { Component, Input, OnInit } from "@angular/core";
import { Layouter2Service } from "../../layouter2.service";

@Component({
  selector: "widget-text-edit",
  templateUrl: "./widget-text-edit.component.html",
  styleUrls: ["./widget-text-edit.component.scss"],
})
export class WidgetTextEditComponent implements OnInit {
  @Input()
  widget;
  @Input()
  dom: HTMLElement;

  constructor(
    private layouterService: Layouter2Service,
  ) {}

  ngOnInit() {
    // if (!this.widget.text) {
    //   this.widget['text'] = {
    //     'font-size': '14px',
    //     'font-weight': 'normal',
    //     'color': '#000000',
    //   }
    // }
    // if (!this.widget.background) {
    //   this.widget['box'] = {
    //     'display': 'flex',
    //     'justify-content': 'flex-start',
    //     'align-items': 'flex-start'
    //   }
    // }
  }

  alignChange(alignCss) {
    // this.widget['box']['justify-content'] = alignCss['justify-content'];
    // this.widget['box']['align-items'] = alignCss['align-items'];
  }

  textChange(e) {
    let iconEl: any = this.dom.querySelector(".icon-box");
    let texEl: any = this.dom.querySelector(".text");
    let tex1El: any = this.dom.querySelector(".text1");
    // console.log(this.widget.cols);

    let widgetWidth = this.widget.cols * this.layouterService.gridSize +
      8 * (this.widget.cols - 1);
    let currentWidth = iconEl.offsetWidth +
      (texEl.offsetWidth > tex1El.offsetWidth
        ? texEl.offsetWidth
        : tex1El.offsetWidth);
    console.log("currentWidth:", currentWidth);
    console.log("widgetWidth:", widgetWidth);

    if (currentWidth > widgetWidth && this.widget.cols < 8) {
      this.widget.cols = this.widget.cols + 1;
      this.layouterService.changeWidget();
    }
  }
}
