import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Events } from '@ionic/angular';
import { Mode } from '../layouter2-mode';

@Component({
  selector: 'layouter2-background',
  templateUrl: './background.component.html',
  styleUrls: ['./background.component.scss']
})
export class BackgroundComponent {
  // id;

  bgList = [
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/0.jpg',
      url: 'assets/img/headerbg.jpg'
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/1.jpg',
      url: 'assets/img/bg/1.jpg'
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/2.jpg',
      url: 'assets/img/bg/2.jpg'
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/3.jpg',
      url: 'assets/img/bg/3.jpg'
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/4.jpg',
      url: 'assets/img/bg/4.jpg'
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/5.jpg',
      url: 'assets/img/bg/5.jpg'
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/f1.jpg',
      url: 'assets/img/bg/f1.jpg',
      isFull: true
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/f2.jpg',
      url: 'assets/img/bg/f2.jpg',
      isFull: true
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/f3.jpg',
      url: 'assets/img/bg/f3.jpg',
      isFull: true
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/f4.jpg',
      url: 'assets/img/bg/f4.jpg',
      isFull: true
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/f5.jpg',
      url: 'assets/img/bg/f5.jpg',
      isFull: true
    }
  ]

  @Output() background = new EventEmitter();

  constructor(
    private events: Events
  ) { }

  exit(e) {
    this.events.publish('layouter2', 'changeMode', Mode.Edit);
  }

  selectedItem = 0;
  selected(item, index) {
    console.log(index);
    this.selectedItem = index;
    this.background.emit({ img: item.url, isFull: item.isFull });
  }

}
