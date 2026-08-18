import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnDestroy,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import Cropper from 'cropperjs';

const AVATAR_OUTPUT_SIZE = 200;
const AVATAR_OUTPUT_TYPE = 'image/webp';
const AVATAR_OUTPUT_QUALITY = 0.82;

export interface AvatarCropResult {
  file: File;
}

@Component({
  selector: 'app-avatar-picker',
  templateUrl: './avatar-picker.component.html',
  styleUrls: ['./avatar-picker.component.scss'],
  standalone: true,
  imports: [IonicModule],
  encapsulation: ViewEncapsulation.None,
})
export class AvatarPickerComponent implements OnDestroy {
  @Input() imageSource = '';
  @Input() fileName = 'avatar.jpg';

  @ViewChild('image') private image?: ElementRef<HTMLImageElement>;

  cropperReady = false;
  confirming = false;
  loadFailed = false;

  private cropper?: Cropper;

  constructor(
    private readonly modalCtrl: ModalController,
    private readonly ngZone: NgZone,
    private readonly changeDetectorRef: ChangeDetectorRef,
  ) {}

  ngOnDestroy(): void {
    this.cropper?.destroy();
  }

  onImageLoad(): void {
    const image = this.image?.nativeElement;
    if (!image || this.cropper) return;

    this.loadFailed = false;
    this.cropper = new Cropper(image, {
      aspectRatio: 1,
      autoCrop: true,
      autoCropArea: 0.78,
      background: false,
      center: false,
      checkOrientation: true,
      cropBoxMovable: false,
      cropBoxResizable: false,
      dragMode: 'move',
      guides: false,
      highlight: true,
      modal: true,
      movable: true,
      responsive: true,
      restore: false,
      rotatable: true,
      scalable: false,
      toggleDragModeOnDblclick: false,
      viewMode: 1,
      wheelZoomRatio: 0.08,
      zoomable: true,
      zoomOnTouch: true,
      zoomOnWheel: true,
      ready: () => {
        this.updateCropperReady(true);
      },
    });
  }

  onImageError(): void {
    this.loadFailed = true;
    this.cropperReady = false;
  }

  cancel(): void {
    void this.modalCtrl.dismiss(undefined, 'cancel');
  }

  async confirm(): Promise<void> {
    if (!this.cropper || !this.cropperReady || this.confirming) return;

    this.confirming = true;
    try {
      const canvas = this.cropper.getCroppedCanvas({
        width: AVATAR_OUTPUT_SIZE,
        height: AVATAR_OUTPUT_SIZE,
        fillColor: '#ffffff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      });
      const blob = await this.canvasToBlob(canvas);
      if (!blob || blob.type !== AVATAR_OUTPUT_TYPE) {
        this.loadFailed = true;
        return;
      }

      const baseName =
        this.fileName
          .replace(/\.[^/.]+$/, '')
          .replace(/[^a-zA-Z0-9._-]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'avatar';
      const file = new File([blob], `${baseName}-cropped.webp`, {
        type: blob.type,
        lastModified: Date.now(),
      });
      const result: AvatarCropResult = { file };
      await this.modalCtrl.dismiss(result, 'confirm');
    } finally {
      this.confirming = false;
    }
  }

  private canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => {
      canvas.toBlob(resolve, AVATAR_OUTPUT_TYPE, AVATAR_OUTPUT_QUALITY);
    });
  }

  private updateCropperReady(ready: boolean): void {
    this.ngZone.run(() => {
      this.cropperReady = ready;
      this.changeDetectorRef.detectChanges();
    });
  }
}
