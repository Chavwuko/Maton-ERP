import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { BucketPieChart } from './BucketPieChart';

function withProvider(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe('BucketPieChart', () => {
  it('shows a "no data" message when every bucket is zero', () => {
    withProvider(
      <BucketPieChart title="Gender Diversity Ratio" data={[{ label: 'MALE', count: 0 }, { label: 'FEMALE', count: 0 }]} />,
    );

    expect(screen.getByText('Gender Diversity Ratio')).toBeInTheDocument();
    expect(screen.getByText('No data yet.')).toBeInTheDocument();
  });

  it('renders without a "no data" message when at least one bucket has a count', () => {
    withProvider(
      <BucketPieChart
        title="Gender Diversity Ratio"
        data={[{ label: 'MALE', count: 3 }, { label: 'FEMALE', count: 2 }]}
        labelMap={{ MALE: 'Male', FEMALE: 'Female' }}
      />,
    );

    expect(screen.getByText('Gender Diversity Ratio')).toBeInTheDocument();
    expect(screen.queryByText('No data yet.')).not.toBeInTheDocument();
  });
});
