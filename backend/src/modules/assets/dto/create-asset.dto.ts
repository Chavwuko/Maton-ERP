export class CreateAssetDto {
  organizationId!: string;
  assetTag!: string;
  name!: string;
  category!: string;
  projectId?: string;
  location?: string;
  // The rest of the record, all optional. Dates are YYYY-MM-DD.
  serialNumber?: string;
  make?: string;
  model?: string;
  purchaseDate?: string;
  purchaseCost?: number;
  vendorId?: string;
  warrantyExpiry?: string;
  condition?: string;
  notes?: string;
  departmentId?: string;
}
