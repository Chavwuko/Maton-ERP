import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { AppNav } from './AppNav';

describe('AppNav', () => {
  it('expands the HR item into Dashboard, Employees, and disabled sub-module placeholders', () => {
    renderWithProviders(<AppNav />, { route: '/hr' });

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/hr');
    expect(screen.getByRole('link', { name: 'Employees' })).toHaveAttribute('href', '/hr/employees');
    for (const label of ['Shift & Attendance', 'Expense Requests', 'Performance', 'Leaves']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText('Coming soon')).toHaveLength(4);
  });

  it('does not confuse the HR Dashboard link with the Employees link when on /hr/employees', () => {
    renderWithProviders(<AppNav />, { route: '/hr/employees' });

    const dashboardLink = screen.getByRole('link', { name: 'Dashboard' });
    const employeesLink = screen.getByRole('link', { name: 'Employees' });
    expect(dashboardLink).not.toHaveAttribute('data-active', 'true');
    expect(employeesLink).toHaveAttribute('data-active', 'true');
  });
});
