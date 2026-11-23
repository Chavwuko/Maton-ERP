import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Anchor, Box, Button, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { QRCodeSVG } from 'qrcode.react';
import { ApiError } from '../../api/client';
import { listAssets } from '../../api/assets';

// Hides the app around the labels when printing, so the page is just the
// sheet of labels.
const PRINT_ONLY = `
@media print {
  .mantine-AppShell-header, .mantine-AppShell-navbar, .no-print { display: none !important; }
  .mantine-AppShell-main { padding: 0 !important; }
}`;

// Printable labels: each carries a QR code that opens the asset's page, so
// scanning the sticker on the equipment brings up its record. `?ids=a,b`
// picks which; with none, every asset still in service gets one.
export function AssetLabelsPage() {
  const [params] = useSearchParams();
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean);

  const {
    data: assets,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['assets', 'labels'], queryFn: () => listAssets() });

  const labelled = (assets ?? []).filter((asset) => (ids.length > 0 ? ids.includes(asset.id) : asset.status !== 'DECOMMISSIONED'));

  return (
    <Stack>
      <style>{PRINT_ONLY}</style>
      <Group justify="space-between" className="no-print">
        <Title order={2}>Asset labels</Title>
        <Button disabled={labelled.length === 0} onClick={() => window.print()}>
          Print
        </Button>
      </Group>
      <Text size="sm" c="dimmed" className="no-print">
        {ids.length > 0 ? (
          <>
            Labels for the assets you picked.{' '}
            <Anchor component={Link} to="/assets">
              Pick others on the register
            </Anchor>
            .
          </>
        ) : (
          'Labels for every asset in service. To print only some, tick them on the register.'
        )}
      </Text>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load assets">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}
      {assets && labelled.length === 0 && <Text>No assets to label.</Text>}

      <Box style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {labelled.map((asset) => (
          <Box
            key={asset.id}
            data-testid="asset-label"
            style={{ width: 220, border: '1px solid #999', borderRadius: 6, padding: 10, display: 'flex', gap: 10, alignItems: 'center', breakInside: 'avoid' }}
          >
            <QRCodeSVG value={`${window.location.origin}/assets/${asset.id}`} size={84} marginSize={0} />
            <Stack gap={2}>
              <Text fw={700} size="sm">
                {asset.assetTag}
              </Text>
              <Text size="xs">{asset.name}</Text>
            </Stack>
          </Box>
        ))}
      </Box>
    </Stack>
  );
}
