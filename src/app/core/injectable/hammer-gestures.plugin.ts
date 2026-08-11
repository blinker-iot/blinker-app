import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { EventManagerPlugin } from '@angular/platform-browser';

interface HammerManager {
  on(eventName: string, handler: (event: unknown) => void): void;
  off(eventName: string, handler: (event: unknown) => void): void;
  destroy(): void;
}

interface HammerStatic {
  Manager: new (
    element: HTMLElement,
    options: { recognizers: unknown[][] },
  ) => HammerManager;
  Tap: unknown;
  Pan: unknown;
  Press: unknown;
  DIRECTION_ALL: number;
}

declare const Hammer: HammerStatic;

const SUPPORTED_EVENTS = new Set([
  'tap',
  'panstart',
  'panmove',
  'panend',
  'pancancel',
  'panleft',
  'panright',
  'panup',
  'pandown',
  'press',
  'pressup',
]);

/** Bridges the Hammer.js gestures used by existing templates into Angular 22. */
@Injectable()
export class HammerGesturesPlugin extends EventManagerPlugin {
  constructor(@Inject(DOCUMENT) document: Document) {
    super(document);
  }

  supports(eventName: string): boolean {
    return SUPPORTED_EVENTS.has(eventName.toLowerCase());
  }

  addEventListener(
    element: HTMLElement,
    eventName: string,
    handler: (...args: unknown[]) => unknown,
  ): () => void {
    const normalizedEventName = eventName.toLowerCase();
    const recognizers = normalizedEventName.startsWith('pan')
      ? [[Hammer.Pan, { direction: Hammer.DIRECTION_ALL, threshold: 5 }]]
      : normalizedEventName.startsWith('press')
        ? [[Hammer.Press, { time: 500, threshold: 99 }]]
        : [[Hammer.Tap]];
    const manager = new Hammer.Manager(element, {
      recognizers,
    });
    const zone = this.manager.getZone();
    const callback = (event: unknown): void => {
      zone.runGuarded(() => handler(event));
    };

    return zone.runOutsideAngular(() => {
      manager.on(normalizedEventName, callback);
      return () => {
        manager.off(normalizedEventName, callback);
        manager.destroy();
      };
    });
  }
}
