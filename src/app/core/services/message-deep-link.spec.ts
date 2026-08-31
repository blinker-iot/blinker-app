import { describe, expect, it } from 'vitest';

import { parseMessageDeepLink } from './message-deep-link';

describe('message deep links', () => {
  it('routes a notification with a business message id to its detail', () => {
    expect(
      parseMessageDeepLink(
        'diandeng://message?messageId=message%2F42',
      ),
    ).toEqual({ messageId: 'message/42' });
  });

  it('routes a notification without an id to the message center', () => {
    expect(parseMessageDeepLink('diandeng://message')).toEqual({
      messageId: null,
    });
  });

  it('rejects malformed and unrelated links', () => {
    expect(parseMessageDeepLink('diandeng://device/device-42')).toBeNull();
    expect(parseMessageDeepLink('diandeng://message/extra')).toBeNull();
    expect(parseMessageDeepLink('diandeng://message?messageId=')).toBeNull();
  });
});
