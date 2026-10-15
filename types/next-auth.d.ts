import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      avatar?: string | null;
      roleId?: string | null;
      roleName?: string | null;
      roleSlug?: string | null;
      isSuperAdmin: boolean;
      isCompanyAdmin: boolean;
      companyId?: string | null;
      companyName?: string | null;
      status: string;
      impersonatedBy?: string | null;
    };
  }

  interface User {
    id: string;
    name: string;
    email: string;
    avatar?: string | null;
    roleId?: string | null;
    roleName?: string | null;
    roleSlug?: string | null;
    isSuperAdmin: boolean;
    isCompanyAdmin: boolean;
    companyId?: string | null;
    companyName?: string | null;
    status: string;
    impersonatedBy?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    name: string;
    email: string;
    avatar?: string | null;
    roleId?: string | null;
    roleName?: string | null;
    roleSlug?: string | null;
    isSuperAdmin: boolean;
    isCompanyAdmin: boolean;
    companyId?: string | null;
    companyName?: string | null;
    status: string;
    impersonatedBy?: string | null;
  }
}
