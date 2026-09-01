export interface Department {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  departments?: Department[];
}
