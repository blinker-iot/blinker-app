import type { DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import type { LegacyBinding } from '../../../core/device-v2/legacy-panel';
import type { PanelDocument } from '../../../core/device-v2/panel-document';
import type { BlinkerDevice } from '../../../core/model/device.model';
import type { DevicePanelRecord } from '../../../core/services/device-panel.service';
import type { DeviceV2PageLayoutRecord } from '../../../core/services/device-v2-page-layout.service';

// A one-time editing seed, not a new connection or persistence owner. Live
// snapshots/revisions are separate inputs and must never replace this draft.
export interface EmbeddedPanelSession {
  device: BlinkerDevice;
  document: PanelDocument;
  snapshot?: DeviceUiSnapshot;
  record?: DeviceV2PageLayoutRecord | null;
  bindings?: Record<string, LegacyBinding>;
  legacyRecord?: DevicePanelRecord | null;
}

export interface SavedPanelEdit {
  record?: DeviceV2PageLayoutRecord | null;
  legacyRecord?: DevicePanelRecord | null;
  consoleRevision?: number;
}
