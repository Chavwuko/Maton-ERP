import { SetMetadata } from '@nestjs/common';

export const ALLOW_INACTIVE_KEY = 'allowInactive';

/**
 * Lets a signed-in user whose account isn't ACTIVE (still pending approval,
 * rejected, or disabled) reach this route. Only the endpoints the "awaiting
 * approval" screen needs — checking your own status and submitting your
 * access request — carry it.
 */
export const AllowInactive = () => SetMetadata(ALLOW_INACTIVE_KEY, true);
