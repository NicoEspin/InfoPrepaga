export type Account = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  isActive: boolean;
  deletedAt: string | null;
  receivesLeads: boolean;
  version: number;
  roles: { role: { name: 'ADMIN' | 'VENDEDOR' } }[];
  _count: { assignedLeads: number; tasks: number };
};
export type AccountsPage = { items: Account[]; total: number; page: number; pageSize: number };
export type AccountValues = {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  role: 'ADMIN' | 'VENDEDOR';
  version?: number;
  replacementId?: string;
};
