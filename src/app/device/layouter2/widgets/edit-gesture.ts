export interface EditGesturePoint {
  pointerId: number;
  clientX: number;
  clientY: number;
}

export function isEditGestureTap(
  start: EditGesturePoint | undefined,
  end: EditGesturePoint,
  tolerance = 8,
): boolean {
  return !!(
    start &&
    start.pointerId === end.pointerId &&
    Math.abs(end.clientX - start.clientX) <= tolerance &&
    Math.abs(end.clientY - start.clientY) <= tolerance
  );
}
