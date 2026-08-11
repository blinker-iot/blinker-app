import type { Animation, TransitionOptions } from '@ionic/core';
import { headerIconTransitionAnimation } from './header-icon-transition.animation';

const findAnimationForElement = (
  animation: Animation,
  element: HTMLElement
): Animation | undefined => {
  if (animation.elements.includes(element)) return animation;

  return animation.childAnimations
    .map((child) => findAnimationForElement(child, element))
    .find((child) => child !== undefined);
};

const setVisibleBounds = (element: HTMLElement) => {
  element.getBoundingClientRect = () =>
    ({
      left: 320,
      top: 10,
      width: 36,
      height: 36,
      right: 356,
      bottom: 46,
      x: 320,
      y: 10,
      toJSON: () => ({}),
    }) as DOMRect;
};

const createPage = (tagName: string, actionMarkup: string) => {
  const page = document.createElement(tagName);
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

describe('headerIconTransitionAnimation', () => {
  it('fades a leaving action before starting the page transition', () => {
    const outlet = document.createElement('ion-router-outlet');
    const enteringPage = createPage(
      'app-settings',
      '<ion-back-button></ion-back-button>'
    );
    const leavingPage = createPage(
      'app-login',
      '<ion-button class="settings-button"></ion-button>'
    );
    const settingsButton = leavingPage.querySelector<HTMLElement>(
      '.settings-button'
    );
    if (!settingsButton) throw new Error('Expected settings button fixture');
    setVisibleBounds(settingsButton);
    outlet.append(enteringPage, leavingPage);
    document.body.append(outlet);

    const animation = headerIconTransitionAnimation(outlet, {
      baseEl: outlet,
      enteringEl: enteringPage,
      leavingEl: leavingPage,
      direction: 'forward',
    } as TransitionOptions);
    const actionAnimation = findAnimationForElement(animation, settingsButton);
    const pageAnimation = animation.childAnimations.find(
      (child) =>
        child.elements.includes(enteringPage) && child.getDuration() === 540
    );

    expect(actionAnimation?.getDelay()).toBe(0);
    expect(actionAnimation?.getDuration()).toBe(180);
    expect(pageAnimation?.getDelay()).toBe(180);
    expect(pageAnimation?.getDuration()).toBe(540);

    animation.destroy();
    outlet.remove();
  });

  it('fades an entering action only after the page transition', () => {
    const outlet = document.createElement('ion-router-outlet');
    const enteringPage = createPage(
      'app-login',
      '<ion-button class="settings-button"></ion-button>'
    );
    const leavingPage = createPage(
      'app-settings',
      '<ion-back-button></ion-back-button>'
    );
    const settingsButton = enteringPage.querySelector<HTMLElement>(
      '.settings-button'
    );
    if (!settingsButton) throw new Error('Expected settings button fixture');
    setVisibleBounds(settingsButton);
    outlet.append(enteringPage, leavingPage);
    document.body.append(outlet);

    const animation = headerIconTransitionAnimation(outlet, {
      baseEl: outlet,
      enteringEl: enteringPage,
      leavingEl: leavingPage,
      direction: 'back',
    } as TransitionOptions);
    const actionAnimation = findAnimationForElement(animation, settingsButton);
    const pageAnimation = animation.childAnimations.find(
      (child) =>
        child.elements.includes(enteringPage) && child.getDuration() === 540
    );

    expect(pageAnimation?.getDelay()).toBe(0);
    expect(pageAnimation?.getDuration()).toBe(540);
    expect(actionAnimation?.getDelay()).toBe(540);
    expect(actionAnimation?.getDuration()).toBe(180);

    animation.destroy();
    outlet.remove();
  });
});
