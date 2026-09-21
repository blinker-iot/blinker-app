// A pre-Grant authority result, not a native/crypto/BBP retry hint.
export class LocalAccessPreparationError extends Error {
  constructor(readonly phase: 'handover' | 'pending') { super(`LOCAL_ACCESS_${phase.toUpperCase()}`); }
}
