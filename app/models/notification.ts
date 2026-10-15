export interface Notification {
  id: string;
  companyId?: string | null;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  data?: Record<string, unknown> | null;
  readAt?: Date | string | null;
  createdAt: Date | string;
}
