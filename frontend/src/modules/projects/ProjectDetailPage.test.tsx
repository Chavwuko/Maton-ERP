import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
import * as projectsApi from '../../api/projects';
import { ProjectDetailPage } from './ProjectDetailPage';
import type { Project } from './types';

vi.mock('../../api/projects');
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useParams: () => ({ id: 'proj-1' }) };
});

const baseProject: Project = {
  id: 'proj-1',
  organizationId: 'org-1',
  code: 'PRJ-001',
  name: 'Refinery Turnaround',
  status: 'PLANNED',
  startDate: null,
  endDate: null,
  budget: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  milestones: [],
};

describe('ProjectDetailPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('offers only the legal next statuses for PLANNED', async () => {
    const user = userEvent.setup();
    vi.mocked(projectsApi.getProject).mockResolvedValue(baseProject);

    renderWithProviders(<ProjectDetailPage />);
    await screen.findByText('PRJ-001 — Refinery Turnaround');

    await user.click(screen.getByRole('button', { name: /PLANNED/i }));

    expect(await screen.findByText('Move to ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('Move to CLOSED')).toBeInTheDocument();
    expect(screen.queryByText('Move to ON HOLD')).not.toBeInTheDocument();
  });

  it('shows a plain badge (no menu) for the terminal CLOSED status', async () => {
    vi.mocked(projectsApi.getProject).mockResolvedValue({ ...baseProject, status: 'CLOSED' });

    renderWithProviders(<ProjectDetailPage />);
    await screen.findByText('PRJ-001 — Refinery Turnaround');

    expect(screen.getByText('CLOSED')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /CLOSED/i })).not.toBeInTheDocument();
  });

  it('picking a transition calls updateProjectStatus with the chosen status', async () => {
    const user = userEvent.setup();
    vi.mocked(projectsApi.getProject).mockResolvedValue(baseProject);
    vi.mocked(projectsApi.updateProjectStatus).mockResolvedValue({ ...baseProject, status: 'ACTIVE' });

    renderWithProviders(<ProjectDetailPage />);
    await screen.findByText('PRJ-001 — Refinery Turnaround');

    await user.click(screen.getByRole('button', { name: /PLANNED/i }));
    await user.click(await screen.findByText('Move to ACTIVE'));

    await waitFor(() => {
      expect(projectsApi.updateProjectStatus).toHaveBeenCalledWith('proj-1', 'ACTIVE');
    });
    expect(await screen.findByText('Status updated')).toBeInTheDocument();
  });

  it('does not show the status menu or milestone create button for a non-manager role', async () => {
    setCurrentRole('hse');
    vi.mocked(projectsApi.getProject).mockResolvedValue(baseProject);

    renderWithProviders(<ProjectDetailPage />);
    await screen.findByText('PRJ-001 — Refinery Turnaround');

    expect(screen.queryByRole('button', { name: /PLANNED/i })).not.toBeInTheDocument();
    expect(screen.getByText('PLANNED')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New milestone' })).not.toBeInTheDocument();
  });

  it('creates a milestone', async () => {
    const user = userEvent.setup();
    vi.mocked(projectsApi.getProject).mockResolvedValue(baseProject);
    vi.mocked(projectsApi.createMilestone).mockResolvedValue({
      id: 'm1',
      projectId: 'proj-1',
      name: 'Foundation complete',
      description: null,
      dueDate: '2026-02-01T00:00:00.000Z',
      status: 'PENDING',
      completedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    renderWithProviders(<ProjectDetailPage />);
    await screen.findByText('PRJ-001 — Refinery Turnaround');

    await user.click(screen.getByRole('button', { name: 'New milestone' }));
    await user.type(await screen.findByLabelText('Name', { exact: false }), 'Foundation complete');
    await user.type(screen.getByLabelText('Due date', { exact: false }), '2026-02-01');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(projectsApi.createMilestone).toHaveBeenCalledWith(
        'proj-1',
        expect.objectContaining({ name: 'Foundation complete' }),
      );
    });
    expect(await screen.findByText('Milestone created')).toBeInTheDocument();
  });
});
