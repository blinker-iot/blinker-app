import {
  EdgeGatewayTopologyState as State,
  isEdgeGatewayTopologyState,
  isEdgeGatewayTopologyTransition,
} from './edge-gateway';

describe('Edge Gateway topology contract', () => {
  it('freezes the exact state codes', () => {
    expect(Object.values(State).filter(value => typeof value === 'number'))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(isEdgeGatewayTopologyState(0)).toBe(false);
    expect(isEdgeGatewayTopologyState(11)).toBe(false);
  });

  it('allows only the frozen forward and cleanup transitions', () => {
    expect(isEdgeGatewayTopologyTransition(
      State.Created, State.PendingAccessDelivery,
    )).toBe(true);
    expect(isEdgeGatewayTopologyTransition(
      State.PendingGatewayProof, State.Active,
    )).toBe(true);
    expect(isEdgeGatewayTopologyTransition(
      State.PendingChildInstall, State.RollbackRequired,
    )).toBe(true);
    expect(isEdgeGatewayTopologyTransition(
      State.Active, State.Created,
    )).toBe(false);
    expect(isEdgeGatewayTopologyTransition(
      State.Detached, State.Active,
    )).toBe(false);
  });
});
