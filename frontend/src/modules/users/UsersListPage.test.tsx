import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
import * as usersApi from '../../api/users';
import { UsersListPage } from './UsersListPage';

vi.mock('../../api/users');

const sampleUsers = [
  {
    id: 'user-1',
    email: 'jane@acme.test',
    firstName: 'Jane',
    lastName: 'Doe',
    isActive: true,
    role: { id: 'role-1', name: 'admin' },
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user-2',
    email: 'new@acme.test',
    firstName: '',
    lastName: '',
    isActive: false,
    role: null,
    createdAt: '2026-01-02T00:00:00.000Z',
  },
];

describe('UsersListPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the users returned by the API, falling back to "—" for a blank name', async () => {
    vi.mocked(usersApi.listUsers).mockResolvedValue(sampleUsers);

    renderWithProviders(<UsersListPage />);

    expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('jane@acme.test')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();

    expect(screen.getByText('new@acme.test')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('shows an empty state when there are no users', async () => {
    vi.mocked(usersApi.listUsers).mockResolvedValue([]);

    renderWithProviders(<UsersListPage />);

    expect(await screen.findByText('No users yet.')).toBeInTheDocument();
  });
});
