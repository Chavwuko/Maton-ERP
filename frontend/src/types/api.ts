export interface Department {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  headId?: string | null;
  head?: { id: string; firstName: string; lastName: string; email: string } | null;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  departments?: Department[];
}
