import {
  createAnimation,
  type Animation,
  type AnimationBuilder,
  type TransitionOptions,
} from '@ionic/core';

const PAGE_TRANSITION_DURATION = 360;
const PAGE_PARALLAX_OFFSET = '18%';
const TRANSITION_EASING = 'cubic-bezier(0.32,0.72,0,1)';

const createPageAnimation = (
  element: HTMLElement,
  duration: number,
  fromTransform: string,
  toTransform: string,
  entering = false
): Animation => {
  const animation = createAnimation()
    .addElement(element)
    .duration(duration)
    .easing(TRANSITION_EASING)
    .fill('both')
    .beforeStyles({ 'will-change': 'transform' })
    .fromTo('transform', fromTransform, toTransform)
    .afterClearStyles(['transform', 'will-change']);

  if (entering) animation.beforeRemoveClass('ion-page-invisible');

  return animation;
};

/**
 * Animate routed page hosts as opaque, self-contained surfaces.
 *
 * Ionic's stock iOS transition animates different descendants depending on
 * whether a route contains a regular ion-content, an absolute header, or an
 * ion-tabs shell. Mixing those structures can briefly expose an empty router
 * outlet. Keeping the animation at the route-host boundary makes every page
 * pair use the same uninterrupted timeline and also works with swipe-back
 * progress animations because it contains no delays.
 */
export const headerIconTransitionAnimation: AnimationBuilder = (
  _baseElement,
  transitionOptions
) => {
  const options = transitionOptions as TransitionOptions;
  const backDirection = options.direction === 'back';
  const duration = options.duration || PAGE_TRANSITION_DURATION;
  const enteringStart = backDirection
    ? `translate3d(-${PAGE_PARALLAX_OFFSET}, 0, 0)`
    : 'translate3d(100%, 0, 0)';
  const leavingEnd = backDirection
    ? 'translate3d(100%, 0, 0)'
    : `translate3d(-${PAGE_PARALLAX_OFFSET}, 0, 0)`;

  const enteringAnimation = createPageAnimation(
    options.enteringEl,
    duration,
    enteringStart,
    'translate3d(0, 0, 0)',
    true
  );

  const animations: Animation[] = [enteringAnimation];
  if (options.leavingEl) {
    animations.push(
      createPageAnimation(
        options.leavingEl,
        duration,
        'translate3d(0, 0, 0)',
        leavingEnd
      )
    );
  }

  return createAnimation().addAnimation(animations);
};
