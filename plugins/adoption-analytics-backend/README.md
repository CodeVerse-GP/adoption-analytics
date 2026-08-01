# @codeverse-gp/plugin-adoption-analytics-backend

Backend for the Adoption Analytics plugin. Ingests analytics events from the Backstage portal,
snapshots the catalog daily, and serves the aggregated dashboard.

- Frontend: [`@codeverse-gp/plugin-adoption-analytics`](../adoption-analytics/README.md)
- Shared types and permissions: [`@codeverse-gp/plugin-adoption-analytics-common`](../adoption-analytics-common/README.md)

## What it provides

| Capability            | Detail                                                                       |
| --------------------- | ---------------------------------------------------------------------------- |
| Event ingest          | Batched `POST /events`, buffered in memory and flushed to Postgres every 5s  |
| Catalog snapshots     | Entity counts per kind and type, written once per day                        |
| Dashboard aggregation | One endpoint returns every KPI, chart series and table the UI needs          |
| Identity pseudonymes  | User refs are hashed unless the caller holds `adoption-analytics.users.read` |
| Access control        | All read endpoints are gated behind `adoption-analytics.page.view`           |
| Retention             | Daily job prunes raw events older than `adoptionAnalytics.retentionDays`     |

## Install

First we need to add the @codeverse-gp/plugin-adoption-analytics-backend package to your backend:

```bash
# From your Backstage root directory
yarn --cwd packages/backend add @codeverse-gp/plugin-adoption-analytics-backend
```

Next we wire this into the overall backend router, edit packages/backend/src/index.ts:

```ts
// packages/backend/src/index.ts
backend.add(import('@codeverse-gp/plugin-adoption-analytics-backend'));
```

Migrations run on startup against the plugin's own database. Nothing else is
required to boot, but **the dashboard will be denied to everyone until you set
`adoptionAnalytics.viewerGroups`** — see [Permissions](#permissions).

## Configuration

All keys live under a top-level `adoptionAnalytics:` block.

```yaml
adoptionAnalytics:
  # Raw event retention, in days. Default: 90.
  retentionDays: 90

  # Groups allowed to open the dashboard. Empty / unset means unrestricted.
  viewerGroups:
    - group:default/platform-admins

  # Groups allowed to see real user identities instead of pseudonyms.
  # Empty / unset means everyone sees masked refs.
  identityGroups:
    - group:default/platform-admins

  # Salt for the pseudonymisation hash. Rotate to invalidate every existing
  # pseudonym without touching event data. Treated as a secret.
  userMaskSalt: ${ADOPTION_ANALYTICS_MASK_SALT}
```

| Key                                | Type       | Default  | Visibility | Notes                                                     |
| ---------------------------------- | ---------- | -------- | ---------- | --------------------------------------------------------- |
| `adoptionAnalytics.retentionDays`  | `number`   | `90`     | backend    | Prunes `insights_events` only; snapshots are never pruned |
| `adoptionAnalytics.viewerGroups`   | `string[]` | `[]`     | backend    | Empty means **allow all**                                 |
| `adoptionAnalytics.identityGroups` | `string[]` | `[]`     | backend    | Empty means **mask for all**                              |
| `adoptionAnalytics.userMaskSalt`   | `string`   | built-in | secret     | Changing it re-pseudonymises every user                   |

`viewerGroups` and `identityGroups` are read by the permission policy in
`packages/backend/src/extensions/permissionsPolicyExtension.ts`, not by this
plugin. If you run a different permission policy you must handle the two
permissions yourself; the config keys will be ignored.

> Setting `retentionDays` below `90` makes the dashboard's "Last 90 days" tab
> quietly show less than 90 days of event-derived data, while the entity-growth
> chart still spans the full range. Keep it at `90` or above if you rely on that
> tab.

## Permissions

Two permissions, defined in `@codeverse-gp/plugin-adoption-analytics-common`. They compose:
the first decides whether you get in, the second decides what you see once
inside.

| Permission                      | Controls                                         | Default when unconfigured |
| ------------------------------- | ------------------------------------------------ | ------------------------- |
| `adoption-analytics.page.view`  | Opening the dashboard and every `/stats/*` route | **Allow**                 |
| `adoption-analytics.users.read` | Seeing real user refs instead of pseudonyms      | **Deny** (masked)         |

The two empty-list defaults deliberately differ. An empty `viewerGroups` keeps a
fresh install usable, while an empty `identityGroups` keeps it private: the
dashboard shows aggregate charts _and_ raw org-wide search queries, so
un-pseudonymised identities must be opted into explicitly.

### Granting access

```yaml
adoptionAnalytics:
  viewerGroups:
    - group:default/platform-admins # can open the dashboard, sees pseudonyms
  identityGroups:
    - group:default/adoption-analytics-admins # additionally sees real user refs
```

Membership is matched against the caller's `ownershipEntityRefs`, so any group
the user belongs to transitively will match. The two lists are independent —
being in `identityGroups` does **not** grant page access on its own.

### Enforcement

`adoption-analytics.page.view` is enforced by a single middleware mounted on the `/stats`
prefix, so any read route added later is protected by default. Failures are not
swallowed: if the permission backend is unreachable the request fails rather
than falling open.

`adoption-analytics.users.read` is checked inside `GET /stats/dashboard`. That check _does_
catch errors and falls back to masking, because the safe failure mode there is
to show less.

`POST /events` and `/health` are deliberately **not** gated. Gating ingest would
silently stop collecting data for everyone outside the viewer allowlist.

## API

Mounted at `/api/adoption-analytics`. All routes require a signed-in caller.

| Method | Path                   | Query                                                          | Returns                                |
| ------ | ---------------------- | -------------------------------------------------------------- | -------------------------------------- |
| `GET`  | `/health`              | —                                                              | `{ status: 'ok' }`                     |
| `POST` | `/events`              | —                                                              | `{ accepted: number }`                 |
| `GET`  | `/stats/dashboard`     | `range`: `7d` \| `30d` \| `90d` (default `30d`)                | `AdoptionAnalyticsDashboard`           |
| `GET`  | `/stats/entity-counts` | `days`: 1–365 (default `30`)                                   | `{ snapshots: EntityCountSnapshot[] }` |
| `GET`  | `/stats/active-users`  | `window`: `daily` \| `weekly` (default `daily`), `days`: 1–365 | `ActiveUsersSummary`                   |
| `GET`  | `/stats/logins`        | `limit`: 1–500 (default `50`)                                  | `{ logins: LoginEvent[] }`             |

Every query string and request body is validated with `zod` before use;
malformed input returns `400`. `POST /events` accepts 1–100 events per batch.
Denied callers get `403`.

`GET /stats/dashboard` is the endpoint the UI uses — it returns the entire
payload in one round trip so the frontend never stitches responses together.

Its `topPages` field groups navigation events by the **first path segment**
(`/docs/default/component/foo` becomes `/docs`). Raw pathnames embed entity refs
and task ids, which would otherwise produce a long tail of single-view rows; the
per-entity detail that grouping discards is already covered by `topEntities`.
Query strings and fragments are stripped before grouping, since some plugins put
free-text filters there.

### Caching

Dashboard responses are cached for 5 minutes. Two separate entries:

- `dashboard:<range>` — the range-scoped payload.
- `dashboard:shared-kpis` — the DAU / WAU / average-session cards, which mean
  the same thing on every tab and so must not be cached per range.

The unmasked payload is what gets cached; masking is applied per request, so one
cache entry serves both permission variants.

## Scheduled tasks

| Task ID                              | Every | Timeout | Purpose                                         |
| ------------------------------------ | ----- | ------- | ----------------------------------------------- |
| `adoption-analytics-events-flush`    | 5s    | 30s     | Drains the in-process queue into the database   |
| `adoption-analytics-entity-snapshot` | 5m    | 10m     | Upserts today's entity counts per kind and type |
| `adoption-analytics-retention`       | 24h   | 30m     | Deletes events older than `retentionDays`       |

The snapshot task runs every 5 minutes but writes at most one row set per
calendar date, replacing the day's rows each time so the final value reflects
the catalog at end of day.

## Database

Two tables, created by migrations in `migrations/`.

**`insights_events`** — one row per captured event.

`id`, `user_ref`, `action`, `subject`, `plugin_id`, `pathname`, `session_id`,
`value`, `timestamp`. Indexed on `user_ref`, `action`, `timestamp`, plus a
composite `(timestamp, action)`.

**`insights_entity_snapshots`** — daily catalog counts.

`id`, `date` (`YYYY-MM-DD`), `kind`, `type`, `count`. Unique on
`(date, kind, type)`.

## Local development

```bash
yarn workspace @codeverse-gp/plugin-adoption-analytics-backend test
yarn tsc
```

To see config changes take effect, restart the backend and switch the time range
in the UI — the dashboard cache is keyed per range and lives for 5 minutes.
