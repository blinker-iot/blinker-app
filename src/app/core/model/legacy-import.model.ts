export interface LegacySource {
  sourceCollection: 'devices' | 'diy_devices';
  sourceId: string;
}

export interface LegacyImportIssue {
  path?: string;
  code: string;
  sourceCollection?: string;
  sourceId?: string;
}

export interface LegacyDeviceSnapshot {
  deviceName?: string;
  displayName: string;
  deviceType?: string;
  otaVersion?: string;
  mode?: string;
  broker?: string;
  disabled?: boolean;
  deviceMac?: string;
  display?: Record<string, unknown>;
  layout?: { format: string; data?: unknown };
  parameters?: Record<string, unknown>;
  issues?: LegacyImportIssue[];
}

export interface LegacyImportRecord extends LegacySource {
  snapshot: LegacyDeviceSnapshot;
  logicalDeviceId?: string | null;
  recoveryResult?: Record<string, unknown>;
  createdAt?: number;
}

export interface LegacyImportPreview {
  authorization: string;
  items: LegacyImportRecord[];
  issues: LegacyImportIssue[];
  nextPage: number | null;
  previewComplete: boolean;
  total: number;
  expiresAt: number;
}

export interface LegacyImportSync {
  results: Array<{ sourceCollection: LegacySource['sourceCollection']; sourceId: string | null; status?: string; code?: string; incomplete?: boolean; record?: LegacyImportRecord; issues?: LegacyImportIssue[] }>;
  nextOffset: number | null;
  summary: { total: number; processed: number; saved: number; failed: number; incomplete: number; complete: boolean };
  expiresAt: number;
}

export function legacySource(value: { sourceCollection?: unknown; sourceId?: unknown }): LegacySource {
  if ((value.sourceCollection !== 'devices' && value.sourceCollection !== 'diy_devices')
    || typeof value.sourceId !== 'string' || !/^[a-f0-9]{24}$/.test(value.sourceId)) {
    throw new Error('旧设备来源标识无效');
  }
  return { sourceCollection: value.sourceCollection, sourceId: value.sourceId };
}

export function legacyImportPath(source: LegacySource): string {
  return `/legacy-device-migration/${source.sourceCollection}/${source.sourceId}`;
}

export function hasLegacyLayout(record: LegacyImportRecord): boolean {
  return record.snapshot.layout?.format !== 'none'
    || !!record.snapshot.issues?.some(issue => /layout|dashboard|elements|config/i.test(issue.path ?? ''));
}
