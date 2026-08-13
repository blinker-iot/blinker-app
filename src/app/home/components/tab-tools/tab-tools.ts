import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule, NavController, ToastController } from '@ionic/angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  MenuListComponent,
  MenuListItem,
} from '../../../core/components/menu-list/menu-list';
import { TOOL_MENU_GROUPS } from '../../../tools/tool-menu.config';
import { navigateToTool } from './tool-navigation';

@Component({
  selector: 'app-tab-tools',
  templateUrl: 'tab-tools.html',
  styleUrls: ['tab-tools.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [IonicModule, TranslatePipe, MenuListComponent],
})
export class TabToolsComponent {
  get groups() {
    return TOOL_MENU_GROUPS.map((group) => ({
      ...group,
      title: this.localizeMenuValue(group.title),
      tools: group.tools.map((tool) => ({
        ...tool,
        title: this.localizeMenuValue(tool.title),
        description: this.localizeMenuValue(tool.description),
        badge: this.localizeMenuValue(tool.badge),
      })),
    }));
  }

  constructor(
    private navController: NavController,
    private toastController: ToastController,
    private translate: TranslateService,
    private router: Router
  ) {}

  async openTool(tool: MenuListItem): Promise<void> {
    if (!tool.route) {
      const toast = await this.toastController.create({
        message: this.translate.instant('TOOLS.COMING_SOON_MESSAGE', {
          title: tool.title,
        }),
        duration: 1600,
        position: 'bottom',
      });
      await toast.present();
      return;
    }

    await navigateToTool(this.router, this.navController, tool.route);
  }

  private localizeMenuValue(value: string): string;
  private localizeMenuValue(value: string | undefined): string | undefined;
  private localizeMenuValue(value: string | undefined): string | undefined {
    return value?.startsWith('TOOLS.') ? this.translate.instant(value) : value;
  }
}
