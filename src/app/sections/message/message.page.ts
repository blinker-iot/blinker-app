import { Component, OnInit } from '@angular/core';
import { MessageService } from './message.service';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'app-message',
  templateUrl: './message.page.html',
  styleUrls: ['./message.page.scss'],
})
export class MessagePage implements OnInit {

  totle = 0;
  editMode = false;

  get messageList() {
    return this.messageService.list
  }

  // messageList = [

  // ];

  constructor(
    private messageService: MessageService,
    private dataService: DataService,
  ) { }

  ngOnInit() {
    this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.messageService.getMessage({}).then(() => {
          // this.messageList = data
          // this.messageList = this.messageService.list;
          // console.log(this.messageList);

        })
      }
    })
  }

  switchMode() {
    this.editMode = !this.editMode;
  }


}
