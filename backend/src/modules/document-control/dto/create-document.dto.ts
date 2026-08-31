export class CreateDocumentDto {
  organizationId!: string;
  title!: string;
  departmentId?: string;
  projectId?: string;
  workOrderId?: string;
  invoiceId?: string;
  incidentId?: string;
  employeeId?: string;
  description?: string;
  category?: string;
}
