import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Group, Modal, Select, Stack, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { checkInAsset, checkOutAsset, updateAsset } from '../../api/assets';
import { ApiError } from '../../api/client';
import { DepartmentSelect } from '../../components/DepartmentSelect';
import { UserSelect } from '../../components/UserSelect';
import { AssetFormFields, assetToForm, formToFields, validateAssetForm, type AssetFormValues } from './AssetFormFields';
import { ASSET_CONDITIONS, type Asset, type AssetCondition } from './types';

interface DialogProps {
  asset: Asset;
  opened: boolean;
  onClose: () => void;
}

// Whatever changed, the asset page, the lists and the custody and change
// histories all need to reload.
function useRefreshAssets() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['assets'] });
}

const errorToast = (fallback: string) => (err: unknown) =>
  notifications.show({ message: err instanceof ApiError ? err.message : fallback, color: 'red' });

export function EditAssetDialog({ asset, opened, onClose }: DialogProps) {
  const refresh = useRefreshAssets();
  const form = useForm<AssetFormValues & { status: 'ACTIVE' | 'DECOMMISSIONED' }>({
    initialValues: { ...assetToForm(asset), status: asset.status === 'DECOMMISSIONED' ? 'DECOMMISSIONED' : 'ACTIVE' },
    validate: validateAssetForm,
  });
  // Under maintenance the work orders own the status.
  const statusLocked = asset.status === 'UNDER_MAINTENANCE';

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      updateAsset(asset.id, {
        assetTag: values.assetTag.trim(),
        name: values.name.trim(),
        category: values.category.trim(),
        ...formToFields(values),
        ...(statusLocked ? {} : { status: values.status }),
      }),
    onSuccess: () => {
      refresh();
      notifications.show({ message: 'Asset updated', color: 'green' });
      onClose();
    },
    onError: errorToast('Failed to update asset'),
  });

  return (
    <Modal opened={opened} onClose={onClose} title={`Edit ${asset.assetTag}`} size="lg">
      <form noValidate onSubmit={form.onSubmit((values) => mutation.mutate(values))}>
        <Stack>
          <AssetFormFields form={form as never} />
          <Select
            label="Status"
            description={statusLocked ? 'Under maintenance: complete or cancel its work order to change this.' : undefined}
            data={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'DECOMMISSIONED', label: 'Decommissioned' },
            ]}
            allowDeselect={false}
            disabled={statusLocked}
            {...form.getInputProps('status')}
          />
          <Group justify="flex-end">
            <Button type="submit" loading={mutation.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function CheckOutDialog({ asset, opened, onClose }: DialogProps) {
  const refresh = useRefreshAssets();
  const form = useForm({
    initialValues: { assigneeId: '', departmentId: '', expectedReturn: '', condition: asset.condition as AssetCondition, notes: '' },
    validate: {
      assigneeId: (value, values) => (!value && !values.departmentId ? 'Choose a person or a department' : null),
    },
  });

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      checkOutAsset(asset.id, {
        assigneeId: values.assigneeId || undefined,
        departmentId: values.departmentId || undefined,
        expectedReturn: values.expectedReturn || undefined,
        condition: values.condition,
        notes: values.notes.trim() || undefined,
      }),
    onSuccess: () => {
      refresh();
      notifications.show({ message: 'Asset checked out', color: 'green' });
      form.reset();
      onClose();
    },
    onError: errorToast('Failed to check out asset'),
  });

  return (
    <Modal opened={opened} onClose={onClose} title={`Check out ${asset.assetTag}`}>
      <form noValidate onSubmit={form.onSubmit((values) => mutation.mutate(values))}>
        <Stack>
          <UserSelect label="Person" clearable {...form.getInputProps('assigneeId')} />
          <DepartmentSelect description="Or a whole department" {...form.getInputProps('departmentId')} />
          <TextInput type="date" label="Expected back" {...form.getInputProps('expectedReturn')} />
          <Select label="Condition now" data={ASSET_CONDITIONS} allowDeselect={false} {...form.getInputProps('condition')} />
          <Textarea label="Notes" {...form.getInputProps('notes')} />
          <Group justify="flex-end">
            <Button type="submit" loading={mutation.isPending}>
              Check out
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function CheckInDialog({ asset, opened, onClose }: DialogProps) {
  const refresh = useRefreshAssets();
  const form = useForm({ initialValues: { condition: asset.condition as AssetCondition, notes: '' } });

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      checkInAsset(asset.id, { condition: values.condition, notes: values.notes.trim() || undefined }),
    onSuccess: () => {
      refresh();
      notifications.show({ message: 'Asset checked in', color: 'green' });
      form.reset();
      onClose();
    },
    onError: errorToast('Failed to check in asset'),
  });

  return (
    <Modal opened={opened} onClose={onClose} title={`Check in ${asset.assetTag}`}>
      <form noValidate onSubmit={form.onSubmit((values) => mutation.mutate(values))}>
        <Stack>
          <Select
            label="Condition it came back in"
            description="This becomes the asset's condition."
            data={ASSET_CONDITIONS}
            allowDeselect={false}
            {...form.getInputProps('condition')}
          />
          <Textarea label="Notes" {...form.getInputProps('notes')} />
          <Group justify="flex-end">
            <Button type="submit" loading={mutation.isPending}>
              Check in
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
