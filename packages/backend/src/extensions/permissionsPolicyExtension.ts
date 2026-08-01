import {
  coreServices,
  createBackendModule,
  type UserInfoService,
} from '@backstage/backend-plugin-api';
import {
  AuthorizeResult,
  isPermission,
  type PolicyDecision,
} from '@backstage/plugin-permission-common';
import type {
  PermissionPolicy,
  PolicyQuery,
  PolicyQueryUser,
} from '@backstage/plugin-permission-node';
import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';
import {
  adoptionAnalyticsPageViewPermission,
  adoptionAnalyticsUsersReadPermission,
} from '@codeverse-gp/plugin-adoption-analytics-common';

/**
 * Groups whose members may see the adoption analytics dashboard, and — separately —
 * un-pseudonymized user identifiers on it. Anyone outside
 * `identityGroups` still gets the dashboard, just with masked user refs.
 *
 * Read from the root-level `adoptionAnalytics` key in app-config so the policy can
 * be re-pointed at real groups without a code change.
 */
type AdoptionAnalyticsPolicyConfig = {
  viewerGroups: string[];
  identityGroups: string[];
};

/**
 * Development / evaluation policy for the adoption analytics plugin.
 *
 * Everything not owned by the adoption analytics plugin is allowed so the rest of
 * Backstage keeps working; the two adoption analytics permissions are decided
 * against catalog group membership. This is the smallest policy that
 * still exercises both branches of the plugin's authorization logic —
 * the `/stats` gate and the user-ref masking fallback.
 */
class AdoptionAnalyticsPermissionPolicy implements PermissionPolicy {
  constructor(
    private readonly userInfo: UserInfoService,
    private readonly config: AdoptionAnalyticsPolicyConfig,
  ) {}

  async handle(
    request: PolicyQuery,
    user?: PolicyQueryUser,
  ): Promise<PolicyDecision> {
    const isAdoptionAnalyticsPermission =
      isPermission(request.permission, adoptionAnalyticsPageViewPermission) ||
      isPermission(request.permission, adoptionAnalyticsUsersReadPermission);

    if (!isAdoptionAnalyticsPermission) {
      return { result: AuthorizeResult.ALLOW };
    }

    // Service-to-service calls arrive without a user principal. They are
    // already vetted by the auth layer, so nothing extra to decide here.
    if (!user) {
      return { result: AuthorizeResult.ALLOW };
    }

    const isIdentityPermission = isPermission(
      request.permission,
      adoptionAnalyticsUsersReadPermission,
    );
    const requiredGroups = isIdentityPermission
      ? this.config.identityGroups
      : this.config.viewerGroups;

    if (requiredGroups.length === 0) {
      // The two empty-allowlist defaults deliberately differ.
      //
      // `viewerGroups` empty means "not restricted", so a fresh install
      // has a usable dashboard before any groups are configured.
      //
      // `identityGroups` empty means "nobody", so a fresh install shows
      // pseudonymized user refs until an admin explicitly opts a group
      // into the unmasked view. Falling back to ALLOW here would leak
      // raw identities by default, which the router assumes never
      // happens.
      return {
        result: isIdentityPermission
          ? AuthorizeResult.DENY
          : AuthorizeResult.ALLOW,
      };
    }

    const { ownershipEntityRefs } = await this.userInfo.getUserInfo(
      user.credentials,
    );
    const isMember = ownershipEntityRefs.some(ref =>
      requiredGroups.includes(ref),
    );

    return {
      result: isMember ? AuthorizeResult.ALLOW : AuthorizeResult.DENY,
    };
  }
}

export default createBackendModule({
  pluginId: 'permission',
  moduleId: 'adoption-analytics-policy',
  register(reg) {
    reg.registerInit({
      deps: {
        policy: policyExtensionPoint,
        config: coreServices.rootConfig,
        userInfo: coreServices.userInfo,
      },
      async init({ policy, config, userInfo }) {
        const adoptionAnalyticsConfig =
          config.getOptionalConfig('adoptionAnalytics');
        policy.setPolicy(
          new AdoptionAnalyticsPermissionPolicy(userInfo, {
            viewerGroups:
              adoptionAnalyticsConfig?.getOptionalStringArray('viewerGroups') ??
              [],
            identityGroups:
              adoptionAnalyticsConfig?.getOptionalStringArray(
                'identityGroups',
              ) ?? [],
          }),
        );
      },
    });
  },
});
