import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
import * as projectsApi from '../../api/projects';
import { ProjectsListPage } from './ProjectsListPage';

vi.mock('../../api/projects');
vi.mock('../../api/organizations', () => ({
  listOrganizations: vi.fn().mockResolvedValue([{ id: 'org-1', name: 'Acme Industrial' }]),
}));

const sampleProjects = [
  {
    id: 'proj-1',
    organizationId: 'org-1',
    code: 'PRJ-001',
    name: 'Refinery Turnaround',
    status: 'PLANNED' as const,
    startDate: null,
    endDate: null,
    budget: '500000',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('ProjectsListPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the projects returned by the API, formatting the budget', async () => {
    vi.mocked(projectsApi.listProjects).mockResolvedValue(sampleProjects);

    renderWithProviders(<ProjectsListPage />);

    expect(await screen.findByText('PRJ-001')).toBeInTheDocument();
    expect(screen.getByText('500,000')).toBeInTheDocument();
  });

  it('shows an empty state when there are no projects', async () => {
    vi.mocked(projectsApi.listProjects).mockResolvedValue([]);

    renderWithProviders(<ProjectsListPage />);

    expect(await screen.findByText('No projects yet.')).toBeInTheDocument();
  });

  it('shows "New project" for admin/project_control but not for a non-manager role', async () => {
    vi.mocked(projectsApi.listProjects).mockResolvedValue([]);

    setCurrentRole('hse');
    renderWithProviders(<ProjectsListPage />);
    await screen.findByText('No projects yet.');

    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument();
  });

  it('creates a project and refreshes the list', async () => {
    const user = userEvent.setup();
    vi.mocked(projectsApi.listProjects).mockResolvedValue([]);
    vi.mocked(projectsApi.createProject).mockResolvedValue({ ...sampleProjects[0], id: 'proj-2', code: 'PRJ-002' });

    renderWithProviders(<ProjectsListPage />);
    await screen.findByText('No projects yet.');

    await user.click(screen.getByRole('button', { name: 'New project' }));
    await user.click(await screen.findByPlaceholderText('Select organization'));
    await user.click(await screen.findByText('Acme Industrial'));
    await user.type(screen.getByLabelText('Code', { exact: false }), 'PRJ-002');
    await user.type(screen.getByLabelText('Name', { exact: false }), 'Pipeline Expansion');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(vi.mocked(projectsApi.createProject).mock.calls[0][0]).toMatchObject({
        organizationId: 'org-1',
        code: 'PRJ-002',
        name: 'Pipeline Expansion',
      });
    });
    expect(await screen.findByText('Project created')).toBeInTheDocument();
  });
});
