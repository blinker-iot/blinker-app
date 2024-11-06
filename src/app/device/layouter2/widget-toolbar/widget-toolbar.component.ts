import { Component, Input, OnInit } from "@angular/core";
import { BlinkerDevice } from "src/app/core/model/device.model";
import { Layouter2Service } from "../layouter2.service";
import { TranslateModule } from "@ngx-translate/core";

@Component({
  selector: "widget-toolbar",
  templateUrl: "./widget-toolbar.component.html",
  styleUrls: ["./widget-toolbar.component.scss"],
  standalone: true,
  imports: [
    TranslateModule,
  ],
})
export class WidgetToolbarComponent implements OnInit {
  @Input()
  device: BlinkerDevice;
  @Input()
  widget;

  constructor(
    private layouterService: Layouter2Service,
  ) {}

  ngOnInit() {
    // styleList[this.widget.type].forEach((element) => {
      
    // })
  }

  close() {
    this.layouterService.unselectWidget();
  }

  async edit() {
    this.layouterService.selectWidget(this.widget);
  }

  layer() {
    if (!this.widget.layerIndex) {
      this.widget["layerIndex"] = 1;
    }
    if (this.widget.layerIndex == 9) {
      this.widget.layerIndex = 1;
    } else {
      this.widget.layerIndex++;
    }
    console.log(this.widget.layerIndex);
    this.layouterService.changeWidget();
  }

  del() {
    this.layouterService.delWidget(this.widget);
  }

  changStyle(i) {
    this.widget['sty'] = i;
  }
}
