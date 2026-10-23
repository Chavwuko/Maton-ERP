import type { PrismaService } from '../../database/prisma.service';

export interface AccessSettings {
  openSignup: boolean;
  allowedEmailDomains: string[];
}

const OPEN_SIGNUP_KEY = 'signup.open';
const ALLOWED_DOMAINS_KEY = 'signup.allowedDomains';

type SettingsDb = Pick<PrismaService, 'appSetting'>;

export async function getAccessSettings(db: SettingsDb): Promise<AccessSettings> {
  const rows = await db.appSetting.findMany({ where: { key: { in: [OPEN_SIGNUP_KEY, ALLOWED_DOMAINS_KEY] } } });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return {
    // Sign-up is open until an admin closes it.
    openSignup: byKey.get(OPEN_SIGNUP_KEY) !== 'false',
    allowedEmailDomains: (byKey.get(ALLOWED_DOMAINS_KEY) ?? '').split(',').filter(Boolean),
  };
}

export function normalizeDomains(domains: string[]): string[] {
  const cleaned = domains.map((domain) => domain.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
  return [...new Set(cleaned)];
}

export async function saveAccessSettings(db: SettingsDb, settings: AccessSettings): Promise<void> {
  const entries: [string, string][] = [
    [OPEN_SIGNUP_KEY, String(settings.openSignup)],
    [ALLOWED_DOMAINS_KEY, settings.allowedEmailDomains.join(',')],
  ];
  for (const [key, value] of entries) {
    await db.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
}

// Why a brand-new sign-up must be turned away, or null when it may proceed to
// the approval queue. With no domain list, any address is allowed.
export function signupBlockedReason(settings: AccessSettings, email: string): string | null {
  if (!settings.openSignup) {
    return 'Sign-ups are currently closed. Contact an administrator.';
  }
  if (settings.allowedEmailDomains.length > 0) {
    const domain = email.split('@')[1]?.toLowerCase() ?? '';
    if (!settings.allowedEmailDomains.includes(domain)) {
      return 'Your email domain is not allowed to sign up. Contact an administrator.';
    }
  }
  return null;
}
