import { NavLink } from '@mantine/core';
import { Link, useLocation } from 'react-router-dom';

interface NavItem {
  label: string;
  path?: string;
  // Exact-match instead of prefix-match — for a child whose path is its
  // parent's own landing page (e.g. HR's "Dashboard" at /hr), a prefix
  // match would light up alongside every other child too.
  exact?: boolean;
  children?: NavItem[];
}

// Mirrors the backend's module build order (see README's "Notes on
// scope"). HR is the first module built out with its own dashboard +
// sub-modules — Shift & Attendance/Expense Requests/Performance/Leaves are
// listed as a visible roadmap and get flipped to `path` as each lands.
const NAV_ITEMS: NavItem[] = [
  { label: 'Organizations', path: '/organizations' },
  { label: 'Document Control', path: '/documents' },
  { label: 'Project Control', path: '/projects' },
  { label: 'Assets', path: '/assets' },
  { label: 'Maintenance', path: '/maintenance' },
  { label: 'Inventory', path: '/inventory' },
  { label: 'Accounting', path: '/accounting' },
  { label: 'HSE', path: '/hse' },
  {
    label: 'HR',
    path: '/hr',
    children: [
      { label: 'Dashboard', path: '/hr', exact: true },
      { label: 'Employees', path: '/hr/employees' },
      { label: 'Shift & Attendance' },
      { label: 'Expense Requests' },
      { label: 'Performance' },
      { label: 'Leaves' },
    ],
  },
  { label: 'Users', path: '/users' },
];

function isActive(item: NavItem, pathname: string): boolean {
  if (!item.path) return false;
  return item.exact ? pathname === item.path : pathname.startsWith(item.path);
}

function renderItem(item: NavItem, pathname: string) {
  if (item.children) {
    return (
      <NavLink key={item.label} label={item.label} defaultOpened={isActive(item, pathname)}>
        {item.children.map((child) => renderItem(child, pathname))}
      </NavLink>
    );
  }

  return item.path ? (
    <NavLink key={item.label} component={Link} to={item.path} label={item.label} active={isActive(item, pathname)} />
  ) : (
    <NavLink key={item.label} label={item.label} description="Coming soon" disabled />
  );
}

export function AppNav() {
  const location = useLocation();

  return <>{NAV_ITEMS.map((item) => renderItem(item, location.pathname))}</>;
}
