import type { HomeCardBinding } from './device-card-preferences';

export interface HomeCardControlIntent {
  binding: HomeCardBinding;
  value?: number;
  manifestFingerprint: string | null;
  stateRevision: number | null;
  stateFresh: boolean;
}

export interface HomeCardControlStatus {
  phase: 'idle' | 'connecting' | 'ready' | 'pending' | 'accepted' | 'synced' | 'unknown' | 'rejected';
  message: string;
  busy: boolean;
  blocked: boolean;
}
