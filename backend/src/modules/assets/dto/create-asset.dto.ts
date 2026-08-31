export class CreateAssetDto {
  organizationId!: string;
  assetTag!: string;
  name!: string;
  category!: string;
  projectId?: string;
  location?: string;
}
