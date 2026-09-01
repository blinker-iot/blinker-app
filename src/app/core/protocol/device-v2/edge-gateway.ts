export enum EdgeGatewayTopologyState {
  Created = 1,
  PendingSecretDelivery = 2,
  PendingChildInstall = 3,
  PendingGatewayProof = 4,
  Active = 5,
  Expired = 6,
  Cancelled = 7,
  RollbackRequired = 8,
  Revoking = 9,
  Detached = 10,
}

export function isEdgeGatewayTopologyState(
  value: unknown,
): value is EdgeGatewayTopologyState {
  return Number.isInteger(value)
    && Number(value) >= EdgeGatewayTopologyState.Created
    && Number(value) <= EdgeGatewayTopologyState.Detached;
}

export function isEdgeGatewayTopologyTransition(
  from: EdgeGatewayTopologyState,
  to: EdgeGatewayTopologyState,
): boolean {
  if (!isEdgeGatewayTopologyState(from)
    || !isEdgeGatewayTopologyState(to)
    || from === to) return false;
  switch (from) {
    case EdgeGatewayTopologyState.Created:
      return to === EdgeGatewayTopologyState.PendingSecretDelivery
        || to === EdgeGatewayTopologyState.Expired
        || to === EdgeGatewayTopologyState.Cancelled;
    case EdgeGatewayTopologyState.PendingSecretDelivery:
      return to === EdgeGatewayTopologyState.PendingChildInstall
        || to === EdgeGatewayTopologyState.Expired
        || to === EdgeGatewayTopologyState.Cancelled;
    case EdgeGatewayTopologyState.PendingChildInstall:
      return to === EdgeGatewayTopologyState.PendingGatewayProof
        || to === EdgeGatewayTopologyState.RollbackRequired;
    case EdgeGatewayTopologyState.PendingGatewayProof:
      return to === EdgeGatewayTopologyState.Active
        || to === EdgeGatewayTopologyState.RollbackRequired;
    case EdgeGatewayTopologyState.Active:
    case EdgeGatewayTopologyState.RollbackRequired:
      return to === EdgeGatewayTopologyState.Revoking;
    case EdgeGatewayTopologyState.Revoking:
      return to === EdgeGatewayTopologyState.Detached;
    default:
      return false;
  }
}
