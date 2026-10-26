import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import type { PanelMode } from '../../../../core/device-v2/custom-panel';

let nextSelectorId = 0;

/** Selection draft only. The settings page retains ownership of persistence and navigation. */
@Component({
  selector: 'app-panel-mode-selector',
  standalone: true,
  templateUrl: './panel-mode-selector.component.html',
  styleUrls: ['./panel-mode-selector.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PanelModeSelectorComponent implements OnChanges {
  @Input() currentMode: PanelMode = 'normal';
  @Input() hasCustomPanel = false;
  @Input() shared = false;
  @Input() busy = false;
  @Input() error = '';
  @Output() readonly confirmed = new EventEmitter<PanelMode>();
  @Output() readonly cancelled = new EventEmitter<void>();

  readonly selectorId = `panel-mode-selector-${++nextSelectorId}`;
  draftMode: PanelMode = 'normal';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentMode'] || changes['hasCustomPanel'] || changes['shared']) {
      this.draftMode = this.currentMode;
    }
  }

  get customUnavailable(): boolean {
    return this.shared && !this.hasCustomPanel;
  }

  get needsCustomCreation(): boolean {
    return this.draftMode === 'custom' && !this.hasCustomPanel && !this.shared;
  }

  get confirmDisabled(): boolean {
    return this.busy || (this.draftMode === this.currentMode && !this.needsCustomCreation)
      || (this.draftMode === 'custom' && this.customUnavailable);
  }

  get confirmLabel(): string {
    if (this.busy) return '正在确认…';
    if (this.needsCustomCreation) return '创建自定义面板';
    return this.draftMode === 'custom' ? '使用自定义面板' : '使用组件面板';
  }

  get draftDescription(): string {
    if (this.needsCustomCreation) return '确认后进入创建页面，创建完成前不会切换。';
    if (this.draftMode !== this.currentMode) return '尚未确认，当前使用的显示模式未改变。';
    return '选择另一种面板后确认应用。';
  }

  selectMode(mode: PanelMode): void {
    if (this.busy || (mode === 'custom' && this.customUnavailable)) return;
    this.draftMode = mode;
  }

  confirmSelection(): void {
    if (!this.confirmDisabled) this.confirmed.emit(this.draftMode);
  }

  cancelDraft(): void {
    if (this.busy) return;
    this.draftMode = this.currentMode;
    this.cancelled.emit();
  }
}
