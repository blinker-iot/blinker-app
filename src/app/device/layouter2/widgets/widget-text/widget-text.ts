import { Component, ElementRef, Input, ViewChild } from "@angular/core";
import { Layouter2Widget } from "../config";
import { Layouter2Service } from "../../layouter2.service";

@Component({
  selector: "widget-text",
  templateUrl: "widget-text.html",
  styleUrls: ["widget-text.scss"],
})
export class WidgetTextComponent implements Layouter2Widget {
  @Input()
  widget;
  @Input()
  device;

  get key() {
    return this.widget.key;
  }

  get tex() {
    return this.getValue(["tex", "t0"]);
  }

  get gridSize() {
    return this.layouter2Service.gridSize;
  }

  @ViewChild("textBox", { static: false }) textBox: ElementRef;
  @ViewChild("text1Box", { static: false }) text1Box: ElementRef;

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

  constructor(
    private el: ElementRef,
    private layouter2Service: Layouter2Service,
  ) {}

  ngAfterViewInit() {
    // console.log(this.layouter2Service.gridSize);
  }
}
