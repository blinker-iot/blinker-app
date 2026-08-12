import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule, NavController, ToastController } from '@ionic/angular';
import {
  MenuListComponent,
  MenuListItem,
} from '../menu-list/menu-list';
import { TOOL_MENU_GROUPS } from '../../../tools/tool-menu.config';
import { navigateToTool } from './tool-navigation';

@Component({
  selector: 'app-tab-tools',
  templateUrl: 'tab-tools.html',
  styleUrls: ['tab-tools.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [IonicModule, MenuListComponent],
})
export class TabToolsComponent {
  readonly groups = TOOL_MENU_GROUPS;

  constructor(
    private navController: NavController,
    private toastController: ToastController,
    private router: Router
  ) {}

  async openTool(tool: MenuListItem): Promise<void> {
    if (!tool.route) {
      const toast = await this.toastController.create({
        message: `${tool.title}即将上线`,
        duration: 1600,
        position: 'bottom',
      });
      await toast.present();
      return;
    }

    await navigateToTool(this.router, this.navController, tool.route);
  }
}
