export type TimerTaskType = 'timing' | 'loop' | 'countdown';

export type TimerAction = string | Record<string, unknown>;

export interface TimingTask {
  task: number;
  ena: number | string;
  tim: number;
  act: TimerAction[];
  day: string | Array<number | string>;
  label?: string;
}

export interface CountdownTask {
  task?: number;
  run: number | string;
  ttim: number;
  rtim: number;
  act: TimerAction[];
  label?: string;
}

export interface LoopTask {
  task?: number;
  run: number | string;
  /** Current firmware uses `tis`; older app data used `tim`. */
  tis?: number;
  tim?: number;
  tri?: number;
  dur1: number;
  act1: TimerAction[];
  dur2: number;
  act2: TimerAction[];
  label?: string;
}

export const TIMER_TYPE_LABELS: Readonly<Record<TimerTaskType, string>> = {
  timing: '定时任务',
  loop: '循环任务',
  countdown: '倒计时任务',
};

export function isTimerObject<T>(value: unknown): value is T {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeTaskCollection<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return isTimerObject<T>(value) ? [value] : [];
}

export function normalizeRepeatDays(value: unknown): string {
  const source = Array.isArray(value) ? value : String(value ?? '').split('');
  return Array.from({ length: 7 }, (_, index) =>
    String(source[index] ?? '0') === '1' ? '1' : '0',
  ).join('');
}

export function isTaskRunning(value: number | string | undefined): boolean {
  return String(value) === '1';
}

export function loopTimes(task: LoopTask): number {
  return Math.max(0, Number(task.tis ?? task.tim) || 0);
}

export function countdownRunPayload(task: CountdownTask, running: boolean): object {
  return running ? { ...task, run: 1 } : { ...task, run: 0, act: null };
}

export function loopRunPayload(task: LoopTask, running: boolean): object {
  return running
    ? { ...task, run: 1 }
    : { ...task, run: 0, act1: null, act2: null };
}

export function formatTimerDuration(value: unknown): string {
  const totalMinutes = Math.max(0, Math.floor(Number(value) || 0));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} 天`);
  if (hours) parts.push(`${hours} 小时`);
  if (minutes || !parts.length) parts.push(`${minutes} 分钟`);
  return parts.join(' ');
}

export function actionJson(action: TimerAction | undefined): string {
  if (!action) return '';
  return typeof action === 'string' ? action : JSON.stringify(action);
}

export function parseTimerAction(action: TimerAction): Record<string, unknown> {
  if (typeof action !== 'string') return action;
  const parsed: unknown = JSON.parse(action);
  if (!isTimerObject<Record<string, unknown>>(parsed)) {
    throw new Error('Timer action must be a JSON object');
  }
  return parsed;
}
