import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams, ViewController } from 'ionic-angular';


@IonicPage()
@Component({
  selector: 'page-icon',
  templateUrl: 'icon.html',
})
export class IconPage {
  item;

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    public viewCtrl: ViewController
  ) {
    this.item = navParams.data;
  }

  select(icon) {
    this.item['ico'] = icon;
    this.viewCtrl.dismiss();
  }


  iconList = ["fal fa-power-off", "fal fa-plug",
    "fal fa-thumbs-up", "fal fa-hand-point-up", "fal fa-hand-point-down", "fal fa-hand-point-left", "fal fa-hand-point-right",
    "fal fa-hand-peace", "fal fa-hand-rock", "fal fa-hand-paper", "fal fa-american-sign-language-interpreting",
    "fal fa-arrow-alt-up", "fal fa-arrow-alt-down", "fal fa-arrow-alt-left", "fal fa-arrow-alt-right",
    "fal fa-meh-blank", "fal fa-meh", "fal fa-surprise", "fal fa-tired", "fal fa-dizzy", "fal fa-frown", "fal fa-smile", "fal fa-skull",
    "fal fa-comments", "fal fa-comment", "fal fa-comment-check", "fal fa-comment-dots", "fal fa-comment-exclamation", "fal fa-comment-smile",
    "fal fa-paper-plane", "fal fa-thumbtack", "fal fa-pencil-alt", "fal fa-heart", "fal fa-heartbeat", "fal fa-home", "fal fa-thermometer-three-quarters",
    "fal fa-atom", "fal fa-burn", "fal fa-fire", "fal fa-tint", "fal fa-sun", "fal fa-umbrella", "fal fa-moon", "fal fa-poop",
    "fal fa-star","fas fa-star",
    "fal fa-bullhorn", "fal fa-book", "fal fa-life-ring", "fal fa-ban", "fal fa-gem", "fal fa-leaf", "fal fa-pennant",
    "fas fa-lightbulb", "fal fa-lightbulb", "fal fa-lightbulb-on","fal fa-lightbulb-exclamation","fal fa-redo-alt", "fal fa-repeat-alt",
    "fal fa-utensil-knife", "fal fa-utensil-spoon", "fal fa-utensil-fork", "fal fa-wrench",
    "fal fa-link","fal fa-thumbtack","fal fa-anchor",
    "fal fa-signature","fal fa-signal","fal fa-signal-4","fal fa-signal-3","fal fa-signal-2","fal fa-signal-1","fal fa-signal-slash",
    "fal fa-search-minus","fal fa-search-plus"
  ]
}
