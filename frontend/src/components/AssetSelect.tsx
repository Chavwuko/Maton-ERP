import { Select, type SelectProps } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { listAssets } from '../api/assets';

export function AssetSelect({ label = 'Asset', ...rest }: Partial<SelectProps>) {
  const { data } = useQuery({ queryKey: ['assets'], queryFn: () => listAssets() });

  return (
    <Select
      label={label}
      placeholder="Select asset"
      searchable
      data={(data ?? []).map((asset) => ({ value: asset.id, label: `${asset.assetTag} — ${asset.name}` }))}
      {...rest}
    />
  );
}
