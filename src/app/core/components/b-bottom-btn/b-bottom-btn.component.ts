import { Component, OnInit, Input } from '@angular/core';
import { ViewService } from '../../services/view.service';

@Component({
  selector: 'b-bottom-btn',
  templateUrl: './b-bottom-btn.component.html',
  styleUrls: ['./b-bottom-btn.component.scss'],
})
export class BBottomBtnComponent implements OnInit {

  get isIos() {
    return this.viewService.isIos
  }

  constructor(
    private viewService: ViewService
  ) { }

  ngOnInit() { }

}
