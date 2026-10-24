import { useSearchParams } from 'react-router-dom';

// Keeps the selected tab in the URL (?tab=requests) so a link, like the one in
// the notification bell, can open a page on the right tab. An unknown or
// missing value falls back to the page's first tab.
export function useTabParam(allowed: string[], fallback: string): [string, (next: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const value = raw && allowed.includes(raw) ? raw : fallback;

  const setTab = (next: string | null) => {
    setParams(next && next !== fallback ? { tab: next } : {}, { replace: true });
  };

  return [value, setTab];
}
