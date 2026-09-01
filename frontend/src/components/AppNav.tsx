import { NavLink } from '@mantine/core';
import { Link, useLocation } from 'react-router-dom';

// Mirrors the backend's module build order (see README's "Notes on
// scope") — only Organizations has a UI so far; the rest are listed so the
// nav doubles as a visible roadmap, and get flipped to `path` as each
// module's frontend lands.
const NAV_ITEMS: Array<{ label: string; path?: string }> = [
  { label: 'Organizations', path: '/organizations' },
  { label: 'Document Control' },
  { label: 'Project Control' },
  { label: 'Assets' },
  { label: 'Maintenance' },
  { label: 'Inventory' },
  { label: 'Accounting' },
  { label: 'HSE' },
  { label: 'HR' },
];

export function AppNav() {
  const location = useLocation();

  return (
    <>
      {NAV_ITEMS.map((item) =>
        item.path ? (
          <NavLink
            key={item.label}
            component={Link}
            to={item.path}
            label={item.label}
            active={location.pathname.startsWith(item.path)}
          />
        ) : (
          <NavLink key={item.label} label={item.label} description="Coming soon" disabled />
        ),
      )}
    </>
  );
}
