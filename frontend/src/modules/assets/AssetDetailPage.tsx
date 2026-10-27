import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Anchor, Badge, Button, Group, Loader, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { ApiError } from '../../api/client';
import { getAsset, getAssetHistory, getAssetServiceHistory, listAssetAssignments } from '../../api/assets';
import { listSchedules } from '../../api/maintenance';
import { StatusBadge } from '../../components/StatusBadge';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { formatMoney, formatQty } from '../inventory/format';
import { ScheduleDialog } from '../maintenance/ScheduleDialog';
import { DUE_STATUS_COLORS, intervalLabel, WORK_ORDER_STATUS_COLORS } from '../maintenance/types';
import { CheckInDialog, CheckOutDialog, EditAssetDialog } from './AssetDialogs';
import { ASSET_CONDITION_COLORS, ASSET_STATUS_COLORS, assetDate, holderName } from './types';

type Dialog = 'edit' | 'check-out' | 'check-in' | 'schedule' | null;

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useRole();
  const [dialog, setDialog] = useState<Dialog>(null);
  const canManage = hasRole(role, ['admin', 'maintenance']);

  const {
    data: asset,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['assets', id],
    queryFn: () => getAsset(id!),
    enabled: !!id,
  });

  const { data: custody } = useQuery({
    queryKey: ['assets', id, 'assignments'],
    queryFn: () => listAssetAssignments(id!),
    enabled: !!id,
  });

  const { data: schedules } = useQuery({
    queryKey: ['maintenance-schedules', { assetId: id }],
    queryFn: () => listSchedules({ assetId: id }),
    enabled: !!id,
  });

  const { data: service } = useQuery({
    queryKey: ['assets', id, 'service-history'],
    queryFn: () => getAssetServiceHistory(id!),
    enabled: !!id,
  });

  const { data: history } = useQuery({
    queryKey: ['assets', id, 'history'],
    queryFn: () => getAssetHistory(id!),
    enabled: !!id && canManage,
  });

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title="Couldn't load asset">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }
  if (!asset) return null;

  const held = asset.currentAssignment;
  const details: [string, React.ReactNode][] = [
    ['Category', asset.category],
    ['Location', asset.location ?? '—'],
    ['Owning department', asset.department?.name ?? '—'],
    ['Make / model', [asset.make, asset.model].filter(Boolean).join(' ') || '—'],
    ['Serial number', asset.serialNumber ?? '—'],
    ['Purchased', assetDate(asset.purchaseDate)],
    ...(asset.purchaseCost === undefined ? [] : ([['Purchase cost', asset.purchaseCost == null ? '—' : formatMoney(asset.purchaseCost)]] as [string, React.ReactNode][])),
    ['Supplier', asset.vendor?.name ?? '—'],
    ['Warranty expires', assetDate(asset.warrantyExpiry)],
    ['Notes', asset.notes ?? '—'],
  ];

  return (
    <Stack>
      <div>
        <Anchor component={Link} to="/assets" size="sm">
          ← All assets
        </Anchor>
      </div>

      <Group justify="space-between">
        <Group>
          <Title order={2}>
            {asset.assetTag} — {asset.name}
          </Title>
          <StatusBadge status={asset.status} colors={ASSET_STATUS_COLORS} />
          <Badge color={ASSET_CONDITION_COLORS[asset.condition]} variant="light">
            {asset.condition}
          </Badge>
        </Group>
        {canManage && (
          <Group>
            <Button variant="light" size="xs" onClick={() => setDialog('edit')}>
              Edit
            </Button>
            {held ? (
              <Button size="xs" onClick={() => setDialog('check-in')}>
                Check in
              </Button>
            ) : (
              asset.status === 'ACTIVE' && (
                <Button size="xs" onClick={() => setDialog('check-out')}>
                  Check out
                </Button>
              )
            )}
          </Group>
        )}
      </Group>

      <Paper withBorder p="md" radius="md">
        {held ? (
          <Stack gap={2}>
            <Text fw={600}>Held by {holderName(held)}</Text>
            <Text size="sm" c="dimmed">
              Since {new Date(held.assignedAt).toLocaleDateString()}
              {held.expectedReturn && ` · expected back ${assetDate(held.expectedReturn)}`}
              {` · condition when taken: ${held.conditionOut}`}
            </Text>
            {held.notes && <Text size="sm">{held.notes}</Text>}
          </Stack>
        ) : (
          <Text c="dimmed">Not checked out.</Text>
        )}
      </Paper>

      <Table>
        <Table.Tbody>
          {details.map(([label, value]) => (
            <Table.Tr key={label}>
              <Table.Th w={200}>{label}</Table.Th>
              <Table.Td>{value}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Title order={4}>Custody history</Title>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Held by</Table.Th>
            <Table.Th>From</Table.Th>
            <Table.Th>Returned</Table.Th>
            <Table.Th>Condition out → in</Table.Th>
            <Table.Th>Notes</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(custody ?? []).map((assignment) => (
            <Table.Tr key={assignment.id}>
              <Table.Td>{holderName(assignment)}</Table.Td>
              <Table.Td>{new Date(assignment.assignedAt).toLocaleDateString()}</Table.Td>
              <Table.Td>{assignment.returnedAt ? new Date(assignment.returnedAt).toLocaleDateString() : 'Still out'}</Table.Td>
              <Table.Td>
                {assignment.conditionOut} → {assignment.conditionIn ?? '—'}
              </Table.Td>
              <Table.Td>{[assignment.notes, assignment.returnNotes].filter(Boolean).join(' · ') || '—'}</Table.Td>
            </Table.Tr>
          ))}
          {(custody ?? []).length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={5}>Never checked out.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Title order={4}>Work orders</Title>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Title</Table.Th>
            <Table.Th>Priority</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Updated</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(asset.workOrders ?? []).map((wo) => (
            <Table.Tr key={wo.id}>
              <Table.Td>
                <Anchor component={Link} to={`/maintenance/${wo.id}`}>
                  {wo.title}
                </Anchor>
              </Table.Td>
              <Table.Td>{wo.priority}</Table.Td>
              <Table.Td>
                <StatusBadge status={wo.status} colors={WORK_ORDER_STATUS_COLORS} />
              </Table.Td>
              <Table.Td>{new Date(wo.updatedAt).toLocaleString()}</Table.Td>
            </Table.Tr>
          ))}
          {(asset.workOrders ?? []).length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={4}>No work orders yet.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Group justify="space-between">
        <Title order={4}>Maintenance schedules</Title>
        {canManage && asset.status !== 'DECOMMISSIONED' && (
          <Button variant="light" size="xs" onClick={() => setDialog('schedule')}>
            Schedule maintenance
          </Button>
        )}
      </Group>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Task</Table.Th>
            <Table.Th>Repeats</Table.Th>
            <Table.Th>Next due</Table.Th>
            <Table.Th>Last done</Table.Th>
            <Table.Th>Status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(schedules ?? []).map((schedule) => (
            <Table.Tr key={schedule.id}>
              <Table.Td>{schedule.title}</Table.Td>
              <Table.Td>{intervalLabel(schedule.intervalValue, schedule.intervalUnit)}</Table.Td>
              <Table.Td>{assetDate(schedule.nextDueDate)}</Table.Td>
              <Table.Td>{assetDate(schedule.lastCompletedDate)}</Table.Td>
              <Table.Td>
                <Badge color={DUE_STATUS_COLORS[schedule.dueStatus]} variant="light">
                  {schedule.dueStatus.replace(/_/g, ' ')}
                </Badge>
              </Table.Td>
            </Table.Tr>
          ))}
          {(schedules ?? []).length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={5}>No maintenance scheduled.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Title order={4}>Service history</Title>
      {service && service.totals.count > 0 && (
        <Text size="sm" c="dimmed">
          {service.totals.count} completed job{service.totals.count === 1 ? '' : 's'} · {service.totals.preventive} preventive · total cost{' '}
          {formatMoney(service.totals.cost)} · last serviced {new Date(service.totals.lastServiceAt!).toLocaleDateString()}
        </Text>
      )}
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Completed</Table.Th>
            <Table.Th>Job</Table.Th>
            <Table.Th>What was done</Table.Th>
            <Table.Th>Parts used</Table.Th>
            <Table.Th>Cost</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(service?.workOrders ?? []).map((wo) => (
            <Table.Tr key={wo.id}>
              <Table.Td>{wo.completedAt ? new Date(wo.completedAt).toLocaleDateString() : '—'}</Table.Td>
              <Table.Td>
                <Anchor component={Link} to={`/maintenance/${wo.id}`}>
                  {wo.title}
                </Anchor>
                <Text size="xs" c="dimmed">
                  {wo.type === 'PREVENTIVE' ? 'Preventive' : 'Repair'}
                </Text>
              </Table.Td>
              <Table.Td>{wo.completionNotes ?? '—'}</Table.Td>
              <Table.Td>
                {wo.stockTransactions.length === 0
                  ? '—'
                  : wo.stockTransactions.map((line) => `${formatQty(Math.abs(line.quantity))} ${line.item.unitOfMeasure} ${line.item.name}`).join(', ')}
              </Table.Td>
              <Table.Td>{wo.cost == null ? '—' : formatMoney(wo.cost)}</Table.Td>
            </Table.Tr>
          ))}
          {(service?.workOrders ?? []).length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={5}>No completed maintenance yet.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      {canManage && (
        <>
          <Title order={4}>Change history</Title>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>When</Table.Th>
                <Table.Th>Who</Table.Th>
                <Table.Th>What</Table.Th>
                <Table.Th>Details</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(history ?? []).map((entry) => (
                <Table.Tr key={entry.id}>
                  <Table.Td>{new Date(entry.createdAt).toLocaleString()}</Table.Td>
                  <Table.Td>
                    {entry.user ? `${entry.user.firstName} ${entry.user.lastName}`.trim() || entry.user.email : 'System'}
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light">{entry.action}</Badge>
                  </Table.Td>
                  <Table.Td>{entry.metadata?.summary ?? '—'}</Table.Td>
                </Table.Tr>
              ))}
              {(history ?? []).length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={4}>No changes recorded.</Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>

          {/* Mounted only while open so each starts from the asset's current values. */}
          {dialog === 'edit' && <EditAssetDialog asset={asset} opened onClose={() => setDialog(null)} />}
          {dialog === 'check-out' && <CheckOutDialog asset={asset} opened onClose={() => setDialog(null)} />}
          {dialog === 'check-in' && <CheckInDialog asset={asset} opened onClose={() => setDialog(null)} />}
          {dialog === 'schedule' && <ScheduleDialog assetId={asset.id} opened onClose={() => setDialog(null)} />}
        </>
      )}
    </Stack>
  );
}
