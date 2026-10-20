import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { IonicModule } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { DeviceUiEndpoint, DeviceUiPort, DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import { capabilityDisplayName, deviceDisplayName } from '../../../core/device-v2/display-metadata';
import { DataService } from '../../../core/services/data.service';
import { AppVisibilityService } from '../../../core/services/app-visibility.service';
import { DeviceCardEditor } from '../../device-card-editor.service';
import { HomeCardBinding, HomeCardLayout, HomeCardMode } from '../../device-card-preferences';
import { canWriteDeviceEndpoint } from '../../../core/device-v2/endpoint-control';
import { Deviceblock } from '../deviceblock/deviceblock';
import { homeCardBindingField, homeCardFields, homeCardReadableFields, homeCardSpan, legacyCardBindings } from '../deviceblock/device-card-presentation';

interface PanelDraft {
  id: string;
  generation: number;
  layout: HomeCardLayout;
  bindings?: HomeCardBinding[];
  focusKey?: string;
  changed: boolean;
}

// Both entrances use the same nested draft. No connections, commands or storage here.
@Component({
  selector: 'home-card-settings',
  standalone: true,
  imports: [IonicModule, Deviceblock],
  templateUrl: './device-card-settings.html',
  styleUrl: './device-card-settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceCardSettingsPanel {
  readonly editor = inject(DeviceCardEditor);
  private readonly data = inject(DataService);
  private readonly ui = inject(DeviceUiPort);
  private readonly visibility = inject(AppVisibilityService);
  readonly foreground = toSignal(this.visibility.active, { requireSync: true });
  readonly panel = signal<PanelDraft | null>(null);
  readonly modalOpen = signal(false);
  readonly snapshot = signal<DeviceUiSnapshot | undefined>(undefined);
  readonly previewColumns = signal(1);
  readonly previewRangeFits = signal(false);
  readonly addMode = signal<HomeCardMode>('read');
  readonly modes: readonly { value: HomeCardMode; label: string }[] = [
    { value: 'read', label: '只读数据' }, { value: 'toggle', label: '快捷开关' },
    { value: 'action', label: '按钮' }, { value: 'range', label: '滑条' },
  ];
  readonly readFailed = signal(false);
  private subscription?: Subscription;

  readonly enabled = computed(() => {
    const panel = this.panel();
    return !!panel && this.modalOpen() && this.current(panel.id, panel.generation)
      && this.foreground() && this.editor.active() && !this.editor.saving();
  });
  readonly fields = computed(() => homeCardReadableFields(this.snapshot()));
  readonly device = computed(() => {
    const panel = this.panel();
    return panel ? this.data.device?.dict?.[panel.id] : undefined;
  });
  readonly name = computed(() => deviceDisplayName(this.device()));
  readonly capacity = computed(() => {
    const panel = this.panel();
    return panel ? Math.min(this.previewColumns(), this.editor.capacity(panel.id, panel.layout) ?? 4) : 1;
  });
  readonly rangeFits = computed(() => {
    const panel = this.panel();
    return !!panel && this.previewRangeFits() && this.editor.rangeFits(panel.id, panel.layout) !== false;
  });
  readonly usedColumns = computed(() => (this.panel()?.bindings ?? []).reduce((sum, binding) => sum + homeCardSpan(binding), 0));
  readonly unresolvedLegacy = computed(() => this.panel()?.bindings === undefined
    && !!this.device()?.config.card?.metrics?.length);
  readonly candidates = computed(() => {
    const keys = new Set(this.panel()?.bindings?.map(binding => binding.key));
    return this.modeFields(this.addMode()).filter(field => !keys.has(field.key));
  });
  readonly canAdd = computed(() => this.enabled() && !this.unresolvedLegacy()
    && this.usedColumns() + (this.addMode() === 'range' ? 2 : 1) <= this.capacity()
    && (this.addMode() !== 'range' || this.rangeFits()) && this.candidates().length > 0);

  constructor() {
    effect(() => {
      const id = this.editor.settingsId();
      const generation = this.editor.settingsGeneration();
      untracked(() => this.open(id, generation));
    });
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  private open(id: string | null, generation: number): void {
    const previous = this.panel();
    if (previous) {
      if (previous.id === id && previous.generation === generation && this.editor.editing() && this.modalOpen()) return;
      // Keep the old modal mounted until Ionic finishes dismissing. Removing it
      // here skips its focus/accessibility and backdrop/scroll-lock cleanup.
      this.subscription?.unsubscribe();
      this.subscription = undefined;
      this.snapshot.set(undefined);
      this.modalOpen.set(false);
      return;
    }
    this.subscription?.unsubscribe();
    this.snapshot.set(undefined);
    this.readFailed.set(false);
    this.previewColumns.set(1);
    this.previewRangeFits.set(false);
    this.addMode.set('read');
    if (!id || !this.editor.editing()) { this.modalOpen.set(false); return; }
    const saved = this.editor.bindings(id);
    this.panel.set({ id, generation, layout: this.editor.layout(id), focusKey: this.editor.settingsKey(),
      bindings: saved?.map(binding => ({ ...binding })), changed: false });
    this.modalOpen.set(true);
    this.subscription = this.ui.watchState(id).subscribe({
      next: snapshot => {
        if (!this.current(id, generation)) return;
        this.snapshot.set(snapshot);
        const panel = this.panel()!;
        if (!panel.changed && panel.bindings === undefined) {
          const bindings = legacyCardBindings(this.device(), snapshot);
          if (bindings !== undefined) this.panel.set({ ...panel, bindings });
        }
      },
      error: () => { if (this.current(id, generation)) { this.snapshot.set(undefined); this.readFailed.set(true); } },
    });
  }

  private current(id: string, generation: number): boolean {
    return this.editor.settingsId() === id && this.editor.settingsGeneration() === generation;
  }

  private update(change: Partial<PanelDraft>): void {
    const panel = this.panel();
    if (!panel || !this.enabled() || !this.current(panel.id, panel.generation)) return;
    this.panel.set({ ...panel, ...change, changed: true });
  }

  setLayout(layout: HomeCardLayout): void {
    if (!this.enabled() || this.panel()?.layout === layout) return;
    this.previewColumns.set(1);
    this.previewRangeFits.set(false);
    this.update({ layout });
  }

  label(binding: HomeCardBinding): string { return capabilityDisplayName(this.device(), binding); }
  reference(binding: HomeCardBinding): string { return JSON.stringify([binding.key, binding.kind, binding.type]); }
  mode(binding: HomeCardBinding): HomeCardMode { return binding.mode ?? 'read'; }
  modeFields(mode: HomeCardMode): DeviceUiEndpoint[] {
    return homeCardFields(this.snapshot(), mode).filter(field => mode === 'read' || canWriteDeviceEndpoint(this.device(), field));
  }
  fieldsFor(binding: HomeCardBinding): DeviceUiEndpoint[] { return this.modeFields(this.mode(binding)); }
  fieldUsed(key: string, index: number): boolean { return this.panel()?.bindings?.some((binding, i) => i !== index && binding.key === key) ?? false; }
  available(binding: HomeCardBinding): boolean {
    const field = homeCardBindingField(this.snapshot(), binding);
    return !!field && (this.mode(binding) === 'read' || canWriteDeviceEndpoint(this.device(), field));
  }

  canSetMode(binding: HomeCardBinding, mode: HomeCardMode): boolean {
    if (this.mode(binding) === mode) return true;
    const replacement = withMode(binding, mode);
    const columns = this.usedColumns() - homeCardSpan(binding) + homeCardSpan(replacement);
    return this.available(replacement) && columns <= this.capacity() && (mode !== 'range' || this.rangeFits());
  }

  setMode(index: number, mode: string): void {
    const panel = this.panel(), binding = panel?.bindings?.[index];
    const requested = this.modes.find(item => item.value === mode)?.value;
    if (!binding || !requested || !this.canSetMode(binding, requested)) return;
    this.update({ bindings: panel!.bindings!.map((value, i) => i === index ? withMode(value, requested) : { ...value }) });
  }

  canSelectAddMode(mode: HomeCardMode): boolean {
    return mode === 'read' || this.modeFields(mode).length > 0 && (mode !== 'range' || this.rangeFits());
  }

  setAddMode(mode: string): void {
    const requested = this.modes.find(item => item.value === mode)?.value;
    if (requested && this.enabled() && this.canSelectAddMode(requested)) this.addMode.set(requested);
  }

  add(reference: string): void {
    if (!this.canAdd()) return;
    const field = this.candidates().find(field => this.reference({ key: field.key, kind: field.manifestKind!, type: field.manifestType! }) === reference);
    if (!field) return;
    this.update({ bindings: [...(this.panel()!.bindings ?? []),
      withMode({ key: field.key, kind: field.manifestKind!, type: field.manifestType! }, this.addMode())] });
  }

  replace(index: number, reference: string): void {
    const panel = this.panel();
    const original = panel?.bindings?.[index];
    if (!original) return;
    const field = this.fieldsFor(original).find(field => this.reference({ key: field.key, kind: field.manifestKind!, type: field.manifestType! }) === reference);
    if (!field || !panel?.bindings?.[index] || panel.bindings.some((binding, i) => i !== index && binding.key === field.key)) return;
    const bindings = panel.bindings.map(binding => ({ ...binding }));
    if (this.usedColumns() > this.capacity() || this.mode(original) === 'range' && !this.rangeFits()) return;
    bindings[index] = withMode({ key: field.key, kind: field.manifestKind!, type: field.manifestType! }, this.mode(original));
    this.update({ bindings });
  }

  remove(index: number): void {
    const bindings = this.panel()?.bindings;
    if (bindings?.[index]) this.update({ bindings: bindings.filter((_, i) => i !== index) });
  }

  move(index: number, offset: number): void {
    const bindings = this.panel()?.bindings?.map(binding => ({ ...binding }));
    const next = index + offset;
    if (!bindings || index < 0 || next < 0 || index >= bindings.length || next >= bindings.length) return;
    [bindings[index], bindings[next]] = [bindings[next], bindings[index]];
    this.update({ bindings });
  }

  clear(): void { this.update({ bindings: [] }); }

  cancel(): void {
    const panel = this.panel();
    if (!panel || !this.current(panel.id, panel.generation)) return;
    if (this.editor.single()) this.editor.cancel();
    else this.editor.closeSettings();
  }

  done(): void {
    const panel = this.panel();
    if (!panel || !this.enabled() || !this.current(panel.id, panel.generation)) return;
    if (!this.editor.applySettings(panel.id, panel.layout, panel.bindings, this.snapshot(),
      { capacity: this.capacity(), rangeFits: this.rangeFits() })) return;
    if (this.editor.single()) this.editor.save();
    else this.editor.closeSettings();
  }

  // A dismissed old modal must not close a newly opened panel/session.
  dismissed(id: string, generation: number): void {
    const panel = this.panel();
    if (!panel || panel.id !== id || panel.generation !== generation) return;
    if (this.current(id, generation)) this.cancel();
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.modalOpen.set(false);
    this.panel.set(null);
    // Only the latest editor context may become the successor. Never replay an
    // old opening or let its delayed dismissal cancel the newer generation.
    this.open(this.editor.settingsId(), this.editor.settingsGeneration());
  }
}

function withMode(binding: HomeCardBinding, mode: HomeCardMode): HomeCardBinding {
  return { key: binding.key, kind: binding.kind, type: binding.type, ...(mode === 'read' ? {} : { mode }) };
}
