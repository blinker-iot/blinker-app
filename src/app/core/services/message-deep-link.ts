const MESSAGE_DEEP_LINK_PROTOCOL = 'diandeng:';
const MESSAGE_DEEP_LINK_HOST = 'message';

export interface MessageDeepLink {
  messageId: string | null;
}

export function parseMessageDeepLink(
  value?: string | null,
): MessageDeepLink | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (
      url.protocol !== MESSAGE_DEEP_LINK_PROTOCOL
      || url.hostname !== MESSAGE_DEEP_LINK_HOST
      || url.username
      || url.password
      || url.port
      || (url.pathname !== '' && url.pathname !== '/')
      || url.hash
    ) {
      return null;
    }

    if (!url.searchParams.has('messageId')) return { messageId: null };
    const messageId = normalizeMessageId(url.searchParams.get('messageId'));
    return messageId ? { messageId } : null;
  } catch {
    return null;
  }
}

export function normalizeMessageId(value?: string | null): string | null {
  const messageId = value?.trim() || '';
  if (
    !messageId
    || messageId.length > 128
    || /[\u0000-\u001f\u007f]/.test(messageId)
  ) {
    return null;
  }
  return messageId;
}
