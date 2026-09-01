export type DocumentStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface DocumentApproval {
  id: string;
  documentVersionId: string;
  reviewerId: string;
  status: ApprovalStatus;
  comment: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  fileKey: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedById: string;
  createdAt: string;
  approvals?: DocumentApproval[];
}

export interface AppDocument {
  id: string;
  organizationId: string;
  departmentId: string | null;
  projectId: string | null;
  workOrderId: string | null;
  invoiceId: string | null;
  incidentId: string | null;
  employeeId: string | null;
  title: string;
  description: string | null;
  category: string | null;
  status: DocumentStatus;
  currentVersion: number;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  versions?: DocumentVersion[];
}

export const DOCUMENT_STATUS_COLORS: Record<DocumentStatus, string> = {
  DRAFT: 'blue',
  IN_REVIEW: 'yellow',
  APPROVED: 'green',
  REJECTED: 'red',
  ARCHIVED: 'gray',
};
