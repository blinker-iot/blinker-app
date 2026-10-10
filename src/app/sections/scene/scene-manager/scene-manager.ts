import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { DataService } from 'src/app/core/services/data.service';

// Legacy configuration remains readable; this page never saves or executes it.
@Component({ selector: 'scene-manager', templateUrl: 'scene-manager.html',
  styleUrls: ['scene-manager.scss'], imports: [IonicModule, RouterLink] })
export class SceneManager {
  constructor(private readonly data: DataService) {}
  get sceneNames(): string[] { return this.data.scene?.list ?? []; }
  actionCount(name: string): number { return this.data.scene?.dict?.[name]?.acts?.length ?? 0; }
}
