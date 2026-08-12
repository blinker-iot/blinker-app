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
  @Input() eyebrow = '';
  @Input() heading = '';
  @Input() description = '';

  get hasSummary(): boolean {
    return Boolean(this.iconClass || this.eyebrow || this.heading || this.description);
  }
}
