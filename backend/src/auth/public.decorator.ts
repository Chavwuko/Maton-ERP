import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as not requiring authentication. Use sparingly — currently
 * only intended for the ALB health check endpoint.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
