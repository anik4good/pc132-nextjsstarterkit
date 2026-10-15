import { User } from './user';

// Enums (mirror Prisma schema CompanyStatus; avoid $Enums when client is generated without it)
export const CompanyStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;
export type CompanyStatus = (typeof CompanyStatus)[keyof typeof CompanyStatus];

// Models
export interface Company {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  logo?: string | null;
  status: CompanyStatus;
  isTrashed: boolean;
  createdByUserId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  users?: User[];
  _count?: { users: number };
}
