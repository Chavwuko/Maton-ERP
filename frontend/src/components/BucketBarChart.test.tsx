import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { BucketBarChart } from './BucketBarChart';

describe('BucketBarChart', () => {
  it('renders the chart title', () => {
    render(
      <MantineProvider>
        <BucketBarChart
          title="Employees by Age Range"
          data={[
            { label: 'Under 25', count: 2 },
            { label: '25-34', count: 5 },
          ]}
        />
      </MantineProvider>,
    );

    expect(screen.getByText('Employees by Age Range')).toBeInTheDocument();
  });
});
