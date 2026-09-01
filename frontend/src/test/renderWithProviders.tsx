import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { render } from '@testing-library/react';
import { RoleProvider } from '../auth/RoleContext';

// Every test gets its own QueryClient (no shared cache across tests) and
// disables retries so a mocked rejection surfaces immediately instead of
// react-query retrying it a few times first.
export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <MantineProvider>
      <Notifications />
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <RoleProvider>{ui}</RoleProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}
