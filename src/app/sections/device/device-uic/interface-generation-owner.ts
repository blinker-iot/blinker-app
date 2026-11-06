// Local generation provenance only, never credentials or device authorization.
export function interfaceGenerationOwner(
  device: { id?: string; deviceName: string } | undefined, session: number, manifest: string,
): string {
  return JSON.stringify([device?.id, device?.deviceName, session, manifest]);
}
