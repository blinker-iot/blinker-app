import { parseShareInvitationId } from '../../core/device-v2/sharing/invitation-link';

export interface MessageInvitationAction {
  type: 'share_invitation';
  invitationId: string;
}

export function parseMessageAction(input: unknown): MessageInvitationAction | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const action = input as Record<string, unknown>;
  if (Object.keys(action).length !== 2 || action['type'] !== 'share_invitation') return null;
  const invitationId = parseShareInvitationId(action['invitationId']);
  return invitationId ? { type: 'share_invitation', invitationId } : null;
}

export interface MessageItem {
  id: string;
  type: string;
  category: string;
  title: string;
  body: string;
  createdAt: number;
  visibleAt: number;
  expiresAt: number | null;
  readAt: number | null;
  unread: boolean;
  // Only authenticated detail responses can carry actions; list/push text cannot.
  action?: MessageInvitationAction | null;
}

export interface MessagePage {
  items: MessageItem[];
  nextCursor: string | null;
}

export interface UnreadSummary {
  total: number;
  categories: Record<string, number>;
  beforeCursor: string | null;
}

export interface MessageReadResult {
  id: string;
  readAt: number;
}

export interface MessageMarkAllReadResult {
  marked: number;
  readAt: number;
}

export interface MessageDeleteResult {
  id: string;
  deletedAt: number;
}

export interface MessageListFilters {
  category?: string;
  unread?: boolean;
  limit?: number;
}
