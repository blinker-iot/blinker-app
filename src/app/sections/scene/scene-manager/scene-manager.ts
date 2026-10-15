import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { DataService } from 'src/app/core/services/data.service';

// Legacy configuration remains readable; this page never saves or executes it.
@Component({ selector: 'scene-manager', templateUrl: 'scene-manager.html',
  styleUrls: ['scene-manager.scss'], imports: [IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar, RouterLink] })
export class SceneManager {
  constructor(private readonly data: DataService) {}
  get sceneNames(): string[] { return this.data.scene?.list ?? []; }
  actionCount(name: string): number { return this.data.scene?.dict?.[name]?.acts?.length ?? 0; }
}
