import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-tool-hero-card',
  templateUrl: './tool-hero-card.component.html',
  styleUrls: ['./tool-hero-card.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolHeroCardComponent {
  @Input({ required: true }) iconClass = '';
  @Input({ required: true }) eyebrow = '';
  @Input({ required: true }) heading = '';
  @Input({ required: true }) description = '';
}
