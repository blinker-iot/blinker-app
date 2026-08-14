import { describe, expect, it } from 'vitest';
import { getSavedFeedbackId } from './feedback.service';

describe('getSavedFeedbackId', () => {
  it('reads a saved feedback id from a normalized Gateway error', () => {
    expect(getSavedFeedbackId({ details: { data: { feedbackId: 42 } } })).toBe(42);
  });

  it('does not mark an ordinary failure as saved', () => {
    expect(getSavedFeedbackId(new Error('offline'))).toBeUndefined();
  });
});
