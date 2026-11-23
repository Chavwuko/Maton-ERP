import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { makeUser } from '../../test/fixtures';
import { pickOption } from '../../test/pickOption';
import { setCurrentRole } from '../../auth/roleStore';
import { ApiError } from '../../api/client';
import * as organizationsApi from '../../api/organizations';
import * as usersApi from '../../api/users';
import { OrganizationDetailPage } from './OrganizationDetailPage';

vi.mock('../../api/organizations');
vi.mock('../../api/users');
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useParams: () => ({ id: 'org-1' }) };
});

const plant = { id: 'dept-1', organizationId: 'org-1', name: 'Plant', code: 'PLT', headId: 'u-ann', head: { id: 'u-ann', firstName: 'Ann', lastName: 'Head', email: 'ann@acme.test' }, createdAt: '' };
const stores = { id: 'dept-2', organizationId: 'org-1', name: 'Stores', code: 'STR', headId: null, head: null, createdAt: '' };

describe('OrganizationDetailPage departments', () => {
  beforeEach(() => {
    setCurrentRole('admin');
    vi.mocked(organizationsApi.getOrganization).mockResolvedValue({ id: 'org-1', name: 'Acme', createdAt: '', updatedAt: '', departments: [plant, stores] } as never);
    vi.mocked(usersApi.listUsers).mockResolvedValue([
      makeUser({ id: 'u-ann', firstName: 'Ann', lastName: 'Head', email: 'ann@acme.test' }),
      makeUser({ id: 'u-bo', firstName: 'Bo', lastName: 'Chief', email: 'bo@acme.test' }),
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows who heads each department', async () => {
    renderWithProviders(<OrganizationDetailPage />);

    expect(await screen.findByText('Ann Head')).toBeInTheDocument();
    expect(within(screen.getByText('Stores').closest('tr')!).getByText('—')).toBeInTheDocument();
  });

  it('names a different head, who approves the first step of the department’s leave', async () => {
    const user = userEvent.setup();
    vi.mocked(organizationsApi.updateDepartment).mockResolvedValue(plant as never);
    renderWithProviders(<OrganizationDetailPage />);

    await user.click((await screen.findAllByRole('button', { name: 'Edit' }))[1]);
    const dialog = await screen.findByRole('dialog', { name: 'Edit department' });
    await pickOption(user, within(dialog).getByPlaceholderText('Select user'), 'Bo Chief (bo@acme.test)');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(organizationsApi.updateDepartment).toHaveBeenCalledWith('dept-2', { code: 'STR', name: 'Stores', headId: 'u-bo' }));
    expect(await screen.findByText('Department updated')).toBeInTheDocument();
  });

  it('surfaces a failure, and leaves editing to admin', async () => {
    const user = userEvent.setup();
    vi.mocked(organizationsApi.updateDepartment).mockRejectedValueOnce(new ApiError(400, 'A department head needs an active account')).mockRejectedValueOnce(new Error('network'));
    renderWithProviders(<OrganizationDetailPage />);

    await user.click((await screen.findAllByRole('button', { name: 'Edit' }))[1]);
    const dialog = await screen.findByRole('dialog', { name: 'Edit department' });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('A department head needs an active account')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Failed to update department')).toBeInTheDocument();
  });

  it('shows no edit buttons to anyone but admin', async () => {
    setCurrentRole('hr');

    renderWithProviders(<OrganizationDetailPage />);

    await screen.findByText('Ann Head');
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });
});
