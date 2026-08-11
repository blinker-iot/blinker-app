import { Component, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'tab-community',
  templateUrl: 'tab-community.html',
  styleUrls: ['tab-community.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, IonicModule, RouterModule],
})
export class TabCommunityComponent {
  constructor() {}

  ngOnInit() {}
}
