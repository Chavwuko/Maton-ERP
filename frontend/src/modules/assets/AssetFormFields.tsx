import { Group, NumberInput, Select, Textarea, TextInput } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import type { AssetFields } from '../../api/assets';
import { DepartmentSelect } from '../../components/DepartmentSelect';
import { VendorSelect } from '../../components/VendorSelect';
import { ASSET_CONDITIONS, DEPRECIATION_METHODS, type Asset, type AssetCondition, type DepreciationMethod } from './types';

export interface AssetFormValues {
  assetTag: string;
  name: string;
  category: string;
  location: string;
  serialNumber: string;
  make: string;
  model: string;
  purchaseDate: string;
  purchaseCost: number | string;
  vendorId: string;
  warrantyExpiry: string;
  condition: AssetCondition;
  notes: string;
  departmentId: string;
  depreciationMethod: DepreciationMethod;
  usefulLifeMonths: number | string;
  salvageValue: number | string;
  depreciationStartDate: string;
}

export const emptyAssetForm: AssetFormValues = {
  assetTag: '',
  name: '',
  category: '',
  location: '',
  serialNumber: '',
  make: '',
  model: '',
  purchaseDate: '',
  purchaseCost: '',
  vendorId: '',
  warrantyExpiry: '',
  condition: 'GOOD',
  notes: '',
  departmentId: '',
  depreciationMethod: 'NONE',
  usefulLifeMonths: '',
  salvageValue: '',
  depreciationStartDate: '',
};

export function assetToForm(asset: Asset): AssetFormValues {
  return {
    assetTag: asset.assetTag,
    name: asset.name,
    category: asset.category,
    location: asset.location ?? '',
    serialNumber: asset.serialNumber ?? '',
    make: asset.make ?? '',
    model: asset.model ?? '',
    purchaseDate: asset.purchaseDate?.slice(0, 10) ?? '',
    purchaseCost: asset.purchaseCost == null ? '' : Number(asset.purchaseCost),
    vendorId: asset.vendorId ?? '',
    warrantyExpiry: asset.warrantyExpiry?.slice(0, 10) ?? '',
    condition: asset.condition,
    notes: asset.notes ?? '',
    departmentId: asset.departmentId ?? '',
    depreciationMethod: asset.depreciationMethod,
    usefulLifeMonths: asset.usefulLifeMonths ?? '',
    salvageValue: asset.salvageValue == null ? '' : Number(asset.salvageValue),
    depreciationStartDate: asset.depreciationStartDate?.slice(0, 10) ?? '',
  };
}

// The optional columns as the API wants them. Blank means "none": on an edit
// that clears the field, on a create it is simply left out.
export function formToFields(values: AssetFormValues): AssetFields {
  const blank = (text: string | null) => (text?.trim() ? text.trim() : null);
  return {
    location: blank(values.location),
    serialNumber: blank(values.serialNumber),
    make: blank(values.make),
    model: blank(values.model),
    purchaseDate: values.purchaseDate || null,
    purchaseCost: values.purchaseCost === '' ? null : Number(values.purchaseCost),
    vendorId: values.vendorId || null,
    warrantyExpiry: values.warrantyExpiry || null,
    condition: values.condition,
    notes: blank(values.notes),
    departmentId: values.departmentId || null,
    depreciationMethod: values.depreciationMethod,
    usefulLifeMonths: values.usefulLifeMonths === '' ? null : Number(values.usefulLifeMonths),
    salvageValue: values.salvageValue === '' ? null : Number(values.salvageValue),
    depreciationStartDate: values.depreciationStartDate || null,
  };
}

export function withoutBlanks(fields: AssetFields): AssetFields {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null)) as AssetFields;
}

export const validateAssetForm = {
  assetTag: (value: string) => (value.trim() ? null : 'Asset tag is required'),
  name: (value: string) => (value.trim() ? null : 'Name is required'),
  category: (value: string) => (value.trim() ? null : 'Category is required'),
  warrantyExpiry: (value: string, values: AssetFormValues) =>
    value && values.purchaseDate && value < values.purchaseDate ? 'The warranty cannot expire before the purchase date' : null,
  // Once a method is chosen, the book value needs a cost, a life and a start.
  purchaseCost: (value: number | string, values: AssetFormValues) =>
    values.depreciationMethod !== 'NONE' && value === '' ? 'Needed to depreciate the asset' : null,
  usefulLifeMonths: (value: number | string, values: AssetFormValues) => {
    if (values.depreciationMethod === 'NONE') return null;
    const months = Number(value);
    return value !== '' && Number.isInteger(months) && months >= 1 && months <= 600 ? null : 'Enter a whole number of months, 1 to 600';
  },
  salvageValue: (value: number | string, values: AssetFormValues) =>
    value !== '' && values.purchaseCost !== '' && Number(value) > Number(values.purchaseCost) ? 'Cannot be more than the purchase cost' : null,
  depreciationStartDate: (value: string, values: AssetFormValues) =>
    values.depreciationMethod !== 'NONE' && !value && !values.purchaseDate ? 'Set a start date, or a purchase date to start from' : null,
};

// Every field of the asset record, shared by "New asset" and "Edit asset".
export function AssetFormFields({ form }: { form: UseFormReturnType<AssetFormValues> }) {
  return (
    <>
      <TextInput label="Asset tag" placeholder="PUMP-001" required {...form.getInputProps('assetTag')} />
      <TextInput label="Name" placeholder="Centrifugal Pump" required {...form.getInputProps('name')} />
      <Group grow align="flex-start">
        <TextInput label="Category" placeholder="Rotating equipment" required {...form.getInputProps('category')} />
        <Select
          label="Condition"
          data={ASSET_CONDITIONS}
          allowDeselect={false}
          {...form.getInputProps('condition')}
        />
      </Group>
      <TextInput label="Location" placeholder="Plant 1 / Bay 3" {...form.getInputProps('location')} />
      <DepartmentSelect label="Owning department" {...form.getInputProps('departmentId')} />
      <Group grow align="flex-start">
        <TextInput label="Make" placeholder="Grundfos" {...form.getInputProps('make')} />
        <TextInput label="Model" placeholder="CR-45" {...form.getInputProps('model')} />
      </Group>
      <TextInput label="Serial number" {...form.getInputProps('serialNumber')} />
      <Group grow align="flex-start">
        <TextInput type="date" label="Purchase date" {...form.getInputProps('purchaseDate')} />
        <NumberInput label="Purchase cost" min={0} decimalScale={2} thousandSeparator="," {...form.getInputProps('purchaseCost')} />
      </Group>
      <VendorSelect label="Supplier" clearable {...form.getInputProps('vendorId')} />
      <TextInput type="date" label="Warranty expires" {...form.getInputProps('warrantyExpiry')} />
      <Textarea label="Notes" {...form.getInputProps('notes')} />
      <Select
        label="Depreciation"
        description={DEPRECIATION_METHODS.find((method) => method.value === form.values.depreciationMethod)?.description}
        data={DEPRECIATION_METHODS.map(({ value, label }) => ({ value, label }))}
        allowDeselect={false}
        {...form.getInputProps('depreciationMethod')}
      />
      {form.values.depreciationMethod !== 'NONE' && (
        <>
          <Group grow align="flex-start">
            <NumberInput label="Useful life (months)" min={1} max={600} allowDecimal={false} required {...form.getInputProps('usefulLifeMonths')} />
            <NumberInput
              label="Salvage value"
              description="Worth at the end of its life"
              min={0}
              decimalScale={2}
              thousandSeparator=","
              {...form.getInputProps('salvageValue')}
            />
          </Group>
          <TextInput
            type="date"
            label="Depreciation starts"
            description="Leave empty to start from the purchase date"
            {...form.getInputProps('depreciationStartDate')}
          />
        </>
      )}
    </>
  );
}
