// Every field is optional. Leaving one out keeps it; sending null (or an empty
// string) clears the ones that can be empty. `status` can only move between
// ACTIVE and DECOMMISSIONED: UNDER_MAINTENANCE follows the work orders.
export class UpdateAssetDto {
  assetTag?: string;
  name?: string;
  category?: string;
  status?: string;
  location?: string | null;
  projectId?: string | null;
  serialNumber?: string | null;
  make?: string | null;
  model?: string | null;
  purchaseDate?: string | null;
  purchaseCost?: number | null;
  vendorId?: string | null;
  warrantyExpiry?: string | null;
  condition?: string;
  notes?: string | null;
  departmentId?: string | null;
}
