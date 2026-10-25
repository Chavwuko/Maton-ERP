import type { PrismaService } from '../../database/prisma.service';

const ENABLED_KEY = 'email.enabled';
const LAST_REMINDER_KEY = 'email.lastReminderDate';

type SettingsDb = Pick<PrismaService, 'appSetting'>;

// The admin's master switch: when off, nothing is emailed at all.
export async function isEmailEnabled(db: SettingsDb): Promise<boolean> {
  const row = await db.appSetting.findUnique({ where: { key: ENABLED_KEY } });
  return row?.value !== 'false';
}

export async function setEmailEnabled(db: SettingsDb, enabled: boolean): Promise<void> {
  const value = String(enabled);
  await db.appSetting.upsert({ where: { key: ENABLED_KEY }, update: { value }, create: { key: ENABLED_KEY, value } });
}

// Claims today's reminder run for this server. Several servers may be running
// the same schedule, and only the first to claim a day sends.
export async function claimReminderDay(db: SettingsDb, today: string): Promise<boolean> {
  const row = await db.appSetting.findUnique({ where: { key: LAST_REMINDER_KEY } });
  if (row?.value === today) return false;

  if (row) {
    const claimed = await db.appSetting.updateMany({ where: { key: LAST_REMINDER_KEY, value: row.value }, data: { value: today } });
    return claimed.count === 1;
  }
  try {
    await db.appSetting.create({ data: { key: LAST_REMINDER_KEY, value: today } });
    return true;
  } catch {
    // Another server created it first.
    return false;
  }
}
