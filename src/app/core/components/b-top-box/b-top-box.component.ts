import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';

@Component({
  standalone: true,
  imports: [],
  selector: 'b-top-box',
  templateUrl: './b-top-box.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./b-top-box.component.scss'],
})
export class BTopBoxComponent implements OnInit {
  constructor() {}

  ngOnInit() {}
}
