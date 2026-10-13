import { signal } from '@angular/core';

const DURATION_MS = 180;

// A display-only number that follows the newest target with one frame loop.
export class AnimatedNumber {
  readonly value = signal<number | undefined>(undefined);
  private target?: number;
  private frame?: number;
  private updatedAt = 0;
  private frameAt = 0;

  set(value: number | undefined): void {
    const target = value !== undefined && Number.isFinite(value) ? value : undefined;

    if (target === this.target) return;

    this.target = target;
    this.updatedAt = performance.now();

    if (target === undefined || this.value() === undefined || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.destroy();
      this.value.set(target);

      return;
    }

    if (this.frame !== undefined) return;

    this.frameAt = this.updatedAt;

    const tick = (time: number) => {
      const elapsed = Math.max(0, time - this.frameAt);
      const settled = time - this.updatedAt >= DURATION_MS;
      const current = this.value()!;
      const amount = 1 - Math.exp(-elapsed / (DURATION_MS / 3));

      this.frameAt = time;

      this.value.set(settled ? this.target! : current + (this.target! - current) * amount);

      this.frame = settled ? undefined : requestAnimationFrame(tick);
    };

    this.frame = requestAnimationFrame(tick);
  }

  destroy(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);

    this.frame = undefined;
  }
}
