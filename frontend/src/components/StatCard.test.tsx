import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders the value and label', () => {
    render(
      <MantineProvider>
        <StatCard label="Total Employees" value={42} />
      </MantineProvider>,
    );

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Total Employees')).toBeInTheDocument();
  });
});
