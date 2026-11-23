import { createTheme, type MantineColorsTuple } from '@mantine/core';

// The look of the app in one place, taken from the Maton logo: its blue is the
// brand colour (sidebar, buttons, links) and its star green the accent (good
// news, the active marker). Soft rounded cards, quiet tables, tinted status
// pills and Inter throughout. Everything else inherits from Mantine.
const brand: MantineColorsTuple = [
  '#eef2fa',
  '#dde5f4',
  '#bccaea',
  '#98adda',
  '#7893cb',
  '#5d7db8',
  '#4768a6', // the logo's blue
  '#3a5589',
  '#2d4270',
  '#223257', // the sidebar
];

// Mantine's green, re-centred on the logo's star green, so every "good" badge,
// success message and tile matches the brand.
const green: MantineColorsTuple = [
  '#e6f7ef',
  '#c6ecda',
  '#93dab8',
  '#5ec797',
  '#2fb77b',
  '#10ac67',
  '#00a75a', // the logo's star green
  '#008a4a',
  '#0a6f3d',
  '#075a31',
];

const font = "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: 6,
  colors: { brand, green },
  fontFamily: font,
  headings: { fontFamily: font, fontWeight: '700' },
  defaultRadius: 'md',
  black: '#1b2640',
  radius: { xs: '4px', sm: '6px', md: '10px', lg: '14px', xl: '20px' },
  shadows: {
    xs: '0 1px 2px rgba(27, 38, 64, 0.06)',
    sm: '0 2px 8px rgba(27, 38, 64, 0.07)',
    md: '0 6px 20px rgba(27, 38, 64, 0.1)',
  },
  components: {
    Paper: { defaultProps: { radius: 'lg' } },
    Button: { defaultProps: { radius: 'md', fw: 600 } },
    Badge: { defaultProps: { radius: 'xl', fw: 600 } },
    Modal: { defaultProps: { radius: 'lg', overlayProps: { blur: 2 } } },
    Table: { defaultProps: { verticalSpacing: 'md', horizontalSpacing: 'md' } },
    Tabs: { defaultProps: { radius: 'md' } },
    Popover: { defaultProps: { radius: 'lg', shadow: 'md' } },
  },
});
