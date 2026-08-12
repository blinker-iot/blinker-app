import type { Animation, TransitionOptions } from '@ionic/core';
import { headerIconTransitionAnimation } from './header-icon-transition.animation';

const createPage = (tagName: string, actionMarkup = '') => {
  const page = document.createElement(tagName);
  page.classList.add('ion-page-invisible');
  page.innerHTML = `
    <ion-header>
      <ion-toolbar>
        <ion-buttons>${actionMarkup}</ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content></ion-content>
  `;
  return page;
};

const createTransition = (
  enteringPage: HTMLElement,
  leavingPage: HTMLElement | undefined,
  direction: 'forward' | 'back',
  overrides: Partial<TransitionOptions> = {}
) => {
  const outlet = document.createElement('ion-router-outlet');
  if (leavingPage) outlet.append(leavingPage);
  outlet.append(enteringPage);
  document.body.append(outlet);

  const animation = headerIconTransitionAnimation(outlet, {
    baseEl: outlet,
    enteringEl: enteringPage,
    leavingEl: leavingPage,
    direction,
    ...overrides,
  } as TransitionOptions);

  return { animation, outlet };
};

const animationFor = (
  animation: Animation,
  element: HTMLElement
): Animation | undefined =>
  animation.childAnimations.find((child) => child.elements.includes(element));

describe('headerIconTransitionAnimation', () => {
  it('uses one continuous route-host timeline from login to settings', () => {
    const enteringPage = createPage(
      'app-settings',
      '<ion-back-button></ion-back-button>'
    );
    const leavingPage = createPage(
      'app-login',
      '<ion-button class="settings-button"></ion-button>'
    );
    const { animation, outlet } = createTransition(
      enteringPage,
      leavingPage,
      'forward'
    );
    const enteringAnimation = animationFor(animation, enteringPage);
    const leavingAnimation = animationFor(animation, leavingPage);

    expect(animation.childAnimations).toHaveLength(2);
    expect(enteringAnimation?.getDelay()).toBe(0);
    expect(enteringAnimation?.getDuration()).toBe(360);
    expect(leavingAnimation?.getDelay()).toBe(0);
    expect(leavingAnimation?.getDuration()).toBe(360);
    expect(enteringAnimation?.getKeyframes()).toEqual([
      { offset: 0, transform: 'translate3d(100%, 0, 0)' },
      { offset: 1, transform: 'translate3d(0, 0, 0)' },
    ]);

    animation.destroy();
    outlet.remove();
  });

  it('uses the reverse route-host transition from settings to login', () => {
    const enteringPage = createPage(
      'app-login',
      '<ion-button class="settings-button"></ion-button>'
    );
    const leavingPage = createPage(
      'app-settings',
      '<ion-back-button></ion-back-button>'
    );
    const { animation, outlet } = createTransition(
      enteringPage,
      leavingPage,
      'back'
    );
    const enteringAnimation = animationFor(animation, enteringPage);
    const leavingAnimation = animationFor(animation, leavingPage);

    expect(animation.childAnimations).toHaveLength(2);
    expect(enteringAnimation?.getKeyframes()).toEqual([
      { offset: 0, transform: 'translate3d(-18%, 0, 0)' },
      { offset: 1, transform: 'translate3d(0, 0, 0)' },
    ]);
    expect(leavingAnimation?.getKeyframes()).toEqual([
      { offset: 0, transform: 'translate3d(0, 0, 0)' },
      { offset: 1, transform: 'translate3d(100%, 0, 0)' },
    ]);

    animation.destroy();
    outlet.remove();
  });

  it('applies the same transition to an ion-tabs home shell and message page', () => {
    const enteringPage = createPage('blinker-home');
    enteringPage.innerHTML = '<ion-tabs></ion-tabs>';
    const leavingPage = createPage('app-message');
    const { animation, outlet } = createTransition(
      enteringPage,
      leavingPage,
      'back'
    );

    expect(animation.childAnimations).toHaveLength(2);
    expect(animationFor(animation, enteringPage)?.getDuration()).toBe(360);
    expect(animationFor(animation, leavingPage)?.getDuration()).toBe(360);

    animation.destroy();
    outlet.remove();
  });

  it('keeps the same delay-free animation for swipe-back progress', () => {
    const enteringPage = createPage('app-login');
    const leavingPage = createPage('app-settings');
    const { animation, outlet } = createTransition(
      enteringPage,
      leavingPage,
      'back',
      { progressCallback: () => undefined }
    );

    expect(animation.childAnimations).toHaveLength(2);
    expect(animation.childAnimations.every((child) => child.getDelay() === 0)).toBe(true);

    animation.destroy();
    outlet.remove();
  });

  it('honors a caller-provided transition duration', () => {
    const enteringPage = createPage('app-device');
    const leavingPage = createPage('blinker-home');
    const { animation, outlet } = createTransition(
      enteringPage,
      leavingPage,
      'forward',
      { duration: 240 }
    );

    expect(animation.childAnimations.every((child) => child.getDuration() === 240)).toBe(true);

    animation.destroy();
    outlet.remove();
  });

  it('handles a first routed page without a leaving view', () => {
    const enteringPage = createPage('blinker-home');
    const { animation, outlet } = createTransition(
      enteringPage,
      undefined,
      'forward'
    );

    expect(animation.childAnimations).toHaveLength(1);
    expect(animationFor(animation, enteringPage)?.getDuration()).toBe(360);

    animation.destroy();
    outlet.remove();
  });
});
