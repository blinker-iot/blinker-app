import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { DocService } from '../../services/doc.service';
import { IonicModule, ModalController } from '@ionic/angular';
import { MarkdownComponent } from 'ngx-markdown';
import { Subscription } from 'rxjs';

type DocumentLoadState = 'loading' | 'ready' | 'empty' | 'error';

@Component({
  selector: 'app-doc',
  templateUrl: './doc.page.html',
  styleUrls: ['./doc.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonicModule, MarkdownComponent],
})
export class DocPage implements OnInit, OnDestroy {
  @Input()
  docTitle = '';

  @Input()
  docUrl = '';

  readonly docContent = signal('');
  readonly loadState = signal<DocumentLoadState>('loading');

  private documentRequest?: Subscription;

  constructor(
    private docService: DocService,
    private modalCtrl: ModalController
  ) {}

  ngOnInit(): void {
    this.loadDocument();
  }

  ngOnDestroy(): void {
    this.documentRequest?.unsubscribe();
  }

  loadDocument(): void {
    const url = this.docUrl.trim();

    this.documentRequest?.unsubscribe();
    this.docContent.set('');

    if (!url) {
      this.loadState.set('error');
      return;
    }

    this.loadState.set('loading');
    this.documentRequest = this.docService.getMarkdownDoc(url).subscribe({
      next: (content) => {
        this.docContent.set(content);
        this.loadState.set(content.trim() ? 'ready' : 'empty');
      },
      error: (error: unknown) => {
        console.error('Failed to load Markdown document', error);
        this.loadState.set('error');
      },
    });
  }

  close(): Promise<boolean> {
    return this.modalCtrl.dismiss();
  }
}
