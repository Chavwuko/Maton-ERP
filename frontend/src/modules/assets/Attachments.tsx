import { useMutation, useQuery } from '@tanstack/react-query';
import { Anchor, Button, Group, Image, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { getDownloadUrl } from '../../api/documentControl';
import type { AppDocument } from '../document-control/types';

const isPhoto = (document: AppDocument) => document.versions?.[0]?.mimeType.startsWith('image/') ?? false;

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// A photo shows as a picture; the link is signed and short-lived, so it is
// asked for when the page loads rather than stored.
function Photo({ document }: { document: AppDocument }) {
  const version = document.versions![0];
  const { data } = useQuery({
    queryKey: ['documents', document.id, 'photo', version.id],
    queryFn: () => getDownloadUrl(document.id, version.id),
    staleTime: 5 * 60 * 1000,
  });
  if (!data) return null;
  return (
    <Anchor href={data.url} target="_blank" rel="noreferrer">
      <Image src={data.url} alt={document.title} w={120} h={90} fit="cover" radius="sm" />
    </Anchor>
  );
}

// An asset's photos, manuals and certificates: pictures first, then the files.
export function Attachments({ documents }: { documents: AppDocument[] }) {
  const download = useMutation({
    mutationFn: (document: AppDocument) => getDownloadUrl(document.id, document.versions![0].id),
    onSuccess: (result) => window.open(result.url, '_blank'),
    onError: (err) => notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to get the download link', color: 'red' }),
  });

  const photos = documents.filter(isPhoto);

  return (
    <>
      {photos.length > 0 && (
        <Group gap="sm">
          {photos.map((document) => (
            <Photo key={document.id} document={document} />
          ))}
        </Group>
      )}
      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Title</Table.Th>
            <Table.Th>File</Table.Th>
            <Table.Th>Added</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {documents.map((document) => {
            const version = document.versions?.[0];
            return (
              <Table.Tr key={document.id}>
                <Table.Td>{document.title}</Table.Td>
                <Table.Td>
                  {version ? (
                    <>
                      {version.fileName} <Text span size="xs" c="dimmed">({size(version.fileSizeBytes)})</Text>
                    </>
                  ) : (
                    '—'
                  )}
                </Table.Td>
                <Table.Td>{new Date(document.createdAt).toLocaleDateString()}</Table.Td>
                <Table.Td>
                  {version && (
                    <Button variant="subtle" size="xs" aria-label={`Download ${document.title}`} onClick={() => download.mutate(document)}>
                      Download
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            );
          })}
          {documents.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={4}>No photos or documents yet.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </>
  );
}
