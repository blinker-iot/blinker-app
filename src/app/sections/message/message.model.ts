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
