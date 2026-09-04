export function cloneWidgetDraft<T>(widget: T): T {
  return JSON.parse(JSON.stringify(widget)) as T;
}

export function commitWidgetDraft<T extends object>(source: T, draft: T): T {
  Object.assign(source, draft);
  return source;
}

export function replaceDashboardWidget<T extends object>(
  dashboard: T[],
  changedWidget: T
): T[] | undefined {
  const index = dashboard.indexOf(changedWidget);
  if (index < 0) return undefined;

  const updatedDashboard = [...dashboard];
  updatedDashboard[index] = { ...changedWidget };
  return updatedDashboard;
}
