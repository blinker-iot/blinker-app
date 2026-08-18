import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-hero-card',
  templateUrl: './hero-card.component.html',
  styleUrls: ['./hero-card.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeroCardComponent {
  @Input() iconClass = '';
  @Input() iconSrc = '';
  @Input() eyebrow = '';
  @Input() heading = '';
  @Input() description = '';
  @Input() meta: string | number | null = null;

  get hasSummary(): boolean {
    return Boolean(
      this.iconClass ||
        this.iconSrc ||
        this.eyebrow ||
        this.heading ||
        this.description
    );
  }

  get hasMeta(): boolean {
    return this.meta !== null && this.meta !== '';
  }
}
