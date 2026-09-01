import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
import * as documentControlApi from '../../api/documentControl';
import { DocumentsListPage } from './DocumentsListPage';

vi.mock('../../api/documentControl');
vi.mock('../../api/organizations', () => ({
  listOrganizations: vi.fn().mockResolvedValue([{ id: 'org-1', name: 'Acme Industrial' }]),
}));

const sampleDocuments = [
  {
    id: 'doc-1',
    organizationId: 'org-1',
    departmentId: null,
    projectId: null,
    workOrderId: null,
    invoiceId: null,
    incidentId: null,
    employeeId: null,
    title: 'Safety SOP',
    description: null,
    category: 'HSE',
    status: 'DRAFT' as const,
    currentVersion: 1,
    ownerId: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('DocumentsListPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the documents returned by the API', async () => {
    vi.mocked(documentControlApi.listDocuments).mockResolvedValue(sampleDocuments);

    renderWithProviders(<DocumentsListPage />);

    expect(await screen.findByText('Safety SOP')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
  });

  it('shows an empty state when there are no documents', async () => {
    vi.mocked(documentControlApi.listDocuments).mockResolvedValue([]);

    renderWithProviders(<DocumentsListPage />);

    expect(await screen.findByText('No documents yet.')).toBeInTheDocument();
  });

  it('shows "Upload document" for every role — creating a document has no RBAC gate', async () => {
    vi.mocked(documentControlApi.listDocuments).mockResolvedValue([]);

    setCurrentRole('finance');
    renderWithProviders(<DocumentsListPage />);
    await screen.findByText('No documents yet.');

    expect(screen.getByRole('button', { name: 'Upload document' })).toBeInTheDocument();
  });

  it('uploads a document with the selected file and refreshes the list', async () => {
    const user = userEvent.setup();
    vi.mocked(documentControlApi.listDocuments).mockResolvedValue([]);
    vi.mocked(documentControlApi.createDocument).mockResolvedValue({ ...sampleDocuments[0], id: 'doc-2' });
    const file = new File(['hello'], 'sop.txt', { type: 'text/plain' });

    renderWithProviders(<DocumentsListPage />);
    await screen.findByText('No documents yet.');

    await user.click(screen.getByRole('button', { name: 'Upload document' }));
    await user.click(await screen.findByPlaceholderText('Select organization'));
    await user.click(await screen.findByText('Acme Industrial'));
    await user.type(screen.getByLabelText('Title', { exact: false }), 'New SOP');
    // Mantine's FileInput doesn't associate its <label> with the underlying
    // <input type="file"> the way getByLabelText expects, and the Modal
    // portals outside RTL's `container`, so query the whole document instead.
    const fileInput = document.body.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error('file input not found');
    await user.upload(fileInput, file);
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => {
      expect(documentControlApi.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1', title: 'New SOP' }),
        file,
      );
    });
    expect(await screen.findByText('Document uploaded')).toBeInTheDocument();
  });

  it('requires a file before submitting', async () => {
    const user = userEvent.setup();
    vi.mocked(documentControlApi.listDocuments).mockResolvedValue([]);

    renderWithProviders(<DocumentsListPage />);
    await screen.findByText('No documents yet.');

    await user.click(screen.getByRole('button', { name: 'Upload document' }));
    await user.click(await screen.findByPlaceholderText('Select organization'));
    await user.click(await screen.findByText('Acme Industrial'));
    await user.type(screen.getByLabelText('Title', { exact: false }), 'New SOP');
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    expect(await screen.findByText('A file is required')).toBeInTheDocument();
    expect(documentControlApi.createDocument).not.toHaveBeenCalled();
  });
});
