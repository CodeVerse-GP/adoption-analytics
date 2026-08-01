import { createHash } from 'node:crypto';

const DEFAULT_SALT = 'insights.v1';
const HASH_LENGTH = 8;

/**
 * Produces a stable pseudonym for a user entity ref that can be shown
 * safely to callers without the `adoption-analytics.users.read` permission.
 *
 * Same input + same salt → same output, so counts and rankings still
 * make sense on the dashboard. Different salts (rotated via
 * `adoptionAnalytics.userMaskSalt`) invalidate old pseudonyms without touching
 * the underlying event data.
 */
export function maskUserRef(
  userRef: string,
  salt: string = DEFAULT_SALT,
): string {
  const digest = createHash('sha256')
    .update(`${salt}|${userRef}`)
    .digest('hex');
  return `user:masked/${digest.slice(0, HASH_LENGTH)}`;
}
