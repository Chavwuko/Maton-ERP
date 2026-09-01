import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
import * as organizationsApi from '../../api/organizations';
import { OrganizationsListPage } from './OrganizationsListPage';

vi.mock('../../api/organizations');

const sampleOrganizations = [
  { id: 'org-1', name: 'Acme Industrial', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', departments: [] },
];

describe('OrganizationsListPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the organizations returned by the API', async () => {
    vi.mocked(organizationsApi.listOrganizations).mockResolvedValue(sampleOrganizations);

    renderWithProviders(<OrganizationsListPage />);

    expect(await screen.findByText('Acme Industrial')).toBeInTheDocument();
  });

  it('shows an empty state when there are no organizations', async () => {
    vi.mocked(organizationsApi.listOrganizations).mockResolvedValue([]);

    renderWithProviders(<OrganizationsListPage />);

    expect(await screen.findByText('No organizations yet.')).toBeInTheDocument();
  });

  it('shows "New organization" for admin but not for a non-admin role', async () => {
    vi.mocked(organizationsApi.listOrganizations).mockResolvedValue([]);

    setCurrentRole('finance');
    renderWithProviders(<OrganizationsListPage />);
    await screen.findByText('No organizations yet.');
    expect(screen.queryByRole('button', { name: 'New organization' })).not.toBeInTheDocument();
  });

  it('creates an organization and refreshes the list', async () => {
    const user = userEvent.setup();
    vi.mocked(organizationsApi.listOrganizations).mockResolvedValue([]);
    vi.mocked(organizationsApi.createOrganization).mockResolvedValue({
      id: 'org-2',
      name: 'New Co',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    renderWithProviders(<OrganizationsListPage />);
    await screen.findByText('No organizations yet.');

    await user.click(screen.getByRole('button', { name: 'New organization' }));
    // Mantine renders the required-field asterisk as literal text inside
    // the <label> ("Name *"), so this needs a partial match.
    await user.type(await screen.findByLabelText('Name', { exact: false }), 'New Co');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      // Not toHaveBeenCalledWith: react-query's mutationFn is invoked with a
      // second (context) argument beyond what createOrganization declares.
      expect(vi.mocked(organizationsApi.createOrganization).mock.calls[0]?.[0]).toEqual({ name: 'New Co' });
    });
    expect(await screen.findByText('Organization created')).toBeInTheDocument();
  });

  it('rejects submitting the create form with an empty name', async () => {
    const user = userEvent.setup();
    vi.mocked(organizationsApi.listOrganizations).mockResolvedValue([]);

    renderWithProviders(<OrganizationsListPage />);
    await screen.findByText('No organizations yet.');

    await user.click(screen.getByRole('button', { name: 'New organization' }));
    await user.click(await screen.findByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(organizationsApi.createOrganization).not.toHaveBeenCalled();
  });
});
