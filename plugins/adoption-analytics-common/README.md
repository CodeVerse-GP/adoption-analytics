# @codeverse-gp/plugin-adoption-analytics-common

Types, permissions and constants shared by the Adoption Analytics frontend and backend.

- Frontend: [`@codeverse-gp/plugin-adoption-analytics`](../adoption-analytics/README.md)
- Backend: [`@codeverse-gp/plugin-adoption-analytics-backend`](../adoption-analytics-backend/README.md)

This package exists so the dashboard payload has exactly one definition, and so
the permission policy can reference the Adoption Analytics permissions without depending
on the backend plugin. It contains no runtime logic beyond constants.

## Install

You only need this directly when writing a permission policy or another plugin
that consumes Adoption Analytics data. The frontend and backend already depend on it.

```bash
yarn workspace <your-package> add @codeverse-gp/plugin-adoption-analytics-common
```

## Permissions

```ts
import {
  adoptionAnalyticsPageViewPermission, // 'adoption-analytics.page.view'
  adoptionAnalyticsUsersReadPermission, // 'adoption-analytics.users.read'
  adoptionAnalyticsPermissions, // both, for iteration
} from '@codeverse-gp/plugin-adoption-analytics-common';
```

| Permission                      | Action | Controls                                         |
| ------------------------------- | ------ | ------------------------------------------------ |
| `adoption-analytics.page.view`  | `read` | Opening the dashboard and every `/stats/*` route |
| `adoption-analytics.users.read` | `read` | Seeing real user refs instead of pseudonyms      |

Both are denied by default. They compose: holding only `page.view` gives a fully
pseudonymised dashboard, so access can be granted without exposing individuals.

Handling them in a policy:

```ts
import { isPermission } from '@backstage/plugin-permission-common';
import { adoptionAnalyticsPageViewPermission } from '@codeverse-gp/plugin-adoption-analytics-common';

if (isPermission(request.permission, adoptionAnalyticsPageViewPermission)) {
  const userGroups = user?.info.ownershipEntityRefs ?? [];
  const allowed = viewerGroups.some(g => userGroups.includes(g));
  return { result: allowed ? AuthorizeResult.ALLOW : AuthorizeResult.DENY };
}
```

In this repo that logic already lives in
`packages/backend/src/extensions/permissionsPolicyExtension.ts`, driven by
`adoptionAnalytics.viewerGroups` and `adoptionAnalytics.identityGroups`. See the
[backend README](../adoption-analytics-backend/README.md#permissions).
