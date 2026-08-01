import { createPermission } from '@backstage/plugin-permission-common';

/**
 * Grants access to the adoption analytics dashboard and every read endpoint that
 * backs it (`/stats/*`).
 *
 * Deliberately separate from {@link adoptionAnalyticsUsersReadPermission}: this
 * one decides *whether* a caller sees the dashboard at all, while that
 * one decides whether the user identities shown on it are
 * un-pseudonymized. Holding this permission alone still yields a masked
 * view, so access can be granted broadly without exposing individuals.
 *
 * @public
 */
export const adoptionAnalyticsPageViewPermission = createPermission({
  name: 'adoption-analytics.page.view',
  attributes: { action: 'read' },
});

/**
 * Grants access to see un-pseudonymized user identifiers in adoption
 * analytics responses (e.g. the raw `userEntityRef` on the Active Users
 * list).
 *
 * By default the adoption analytics backend masks user refs to a stable hash so
 * anyone with dashboard access can see engagement metrics without
 * exposing individual identities — a GDPR / workplace-monitoring
 * consideration for EU deployments. Only callers whose permission
 * policy grants this permission see the real refs.
 *
 * @public
 */
export const adoptionAnalyticsUsersReadPermission = createPermission({
  name: 'adoption-analytics.users.read',
  attributes: { action: 'read' },
});

/**
 * All permissions defined by the adoption analytics plugin. Export lets policy
 * modules iterate them and register catch-all rules if desired.
 *
 * @public
 */
export const adoptionAnalyticsPermissions = [
  adoptionAnalyticsPageViewPermission,
  adoptionAnalyticsUsersReadPermission,
];
