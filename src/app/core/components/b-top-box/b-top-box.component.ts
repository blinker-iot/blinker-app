import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    standalone: true,
    imports: [CommonModule],
    selector: 'b-top-box',
    templateUrl: './b-top-box.component.html',
    styleUrls: ['./b-top-box.component.scss']
})
export class BTopBoxComponent implements OnInit {

  constructor() { }

  ngOnInit() {}

}
