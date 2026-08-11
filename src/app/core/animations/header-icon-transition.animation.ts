import {
  createAnimation,
  iosTransitionAnimation,
  type AnimationBuilder,
  type TransitionOptions,
} from '@ionic/core';

const HEADER_ACTION_SELECTOR =
  ':scope > ion-header ion-buttons > :not(ion-back-button)';
const PAGE_TRANSITION_DURATION = 540;
const ACTION_FADE_DURATION = 180;
const TRANSITION_EASING = 'cubic-bezier(0.32,0.72,0,1)';

const getHeaderActions = (page: HTMLElement | undefined) =>
  page
    ? Array.from(
        page.querySelectorAll<HTMLElement>(HEADER_ACTION_SELECTOR)
      ).filter((action) => action.getBoundingClientRect().width > 0)
    : [];

/**
 * Keep Ionic's native iOS page and ion-back-button transition intact, while
 * sequencing custom header actions around it:
 *
 * leaving actions fade out -> Ionic page transition -> entering actions fade in.
 *
 * Keeping these phases separate also prevents an incoming toolbar from covering
 * the outgoing action before its fade is visible.
 */
export const headerIconTransitionAnimation: AnimationBuilder = (
  baseElement,
  transitionOptions
) => {
  const options = transitionOptions as TransitionOptions;
  const pageAnimation = iosTransitionAnimation(baseElement, options);

  // Delays cannot be represented faithfully by Ionic's interactive progress
  // controller. Preserve the stock transition for swipe-back gestures.
  if (options.progressCallback) return pageAnimation;

  const enteringActions = getHeaderActions(options.enteringEl);
  const leavingActions = getHeaderActions(options.leavingEl);
  const pageDuration = options.duration || PAGE_TRANSITION_DURATION;
  const pageDelay = leavingActions.length ? ACTION_FADE_DURATION : 0;
  const enteringDelay = pageDelay + pageDuration;
  const rootAnimation = createAnimation();

  if (pageDelay) {
    // iosTransitionAnimation removes ion-page-invisible as soon as it starts.
    // Keep the incoming page hidden until the outgoing action fade is done.
    rootAnimation.addAnimation(
      createAnimation()
        .addElement(options.enteringEl)
        .duration(pageDelay)
        .fill('both')
        .fromTo('visibility', 'hidden', 'hidden')
        .afterClearStyles(['visibility'])
    );

    rootAnimation.addAnimation(
      createAnimation()
        .addElement(leavingActions)
        .duration(ACTION_FADE_DURATION)
        .easing(TRANSITION_EASING)
        .fill('both')
        .fromTo('opacity', 0.99, 0)
    );
  }

  rootAnimation.addAnimation(
    pageAnimation.duration(pageDuration).delay(pageDelay)
  );

  if (enteringActions.length) {
    rootAnimation.addAnimation(
      createAnimation()
        .addElement(enteringActions)
        .duration(ACTION_FADE_DURATION)
        .delay(enteringDelay)
        .easing(TRANSITION_EASING)
        .fill('both')
        .fromTo('opacity', 0.01, 1)
    );
  }

  return rootAnimation;
};
