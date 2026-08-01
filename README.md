# Adoption Analytics for Backstage

Adoption Analytics captures every navigation, search and click inside Backstage,
stores them in your own database, and renders a dashboard at
`/adoption-analytics` — active users, session length, catalog growth, most-viewed
entities and top search terms.

No third-party analytics service is involved. The data never leaves your
infrastructure, and user identities are pseudonymised by default so you can
measure behaviour without building a surveillance tool.

## Packages

| Package                                                                                           | Path                                 | What it does                                                       |
| ------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| [`@codeverse-gp/plugin-adoption-analytics`](plugins/adoption-analytics/README.md)                 | `plugins/adoption-analytics`         | **Frontend** — the dashboard page and the event-capture API        |
| [`@codeverse-gp/plugin-adoption-analytics-backend`](plugins/adoption-analytics-backend/README.md) | `plugins/adoption-analytics-backend` | **Backend** — event ingestion, aggregation, retention, permissions |
| [`@codeverse-gp/plugin-adoption-analytics-common`](plugins/adoption-analytics-common/README.md)   | `plugins/adoption-analytics-common`  | Shared types and permission definitions used by both sides         |

This repository is also a working Backstage app (`packages/app`,
`packages/backend`) that exists to develop and demo the plugins against.

## Try it

Requires Node 22 or 24, Yarn 4 and a Postgres instance.

```sh
yarn install
yarn start
```

Then open http://localhost:3000/adoption-analytics. The frontend runs on port
3000 and the backend on 7007.

Database connection, auth providers and access control live in
[app-config.yaml](app-config.yaml) to get started.

## Installing into your own Backstage

Start with the [backend README](plugins/adoption-analytics-backend/README.md) —
it owns the database, the config schema and the permission model. Then wire up
the [frontend](plugins/adoption-analytics/README.md).

Read the permissions section before deploying. With `adoptionAnalytics.viewerGroups`
unset the dashboard is open to every signed-in user.

## Contributing

Contributions are welcome — bug fixes, new charts, better aggregations, or just
clearer docs.

1. Fork the repo and create a branch from `main`.
2. Make your change.
3. Run the checks below and make sure they all pass.
4. Open a pull request describing what changed and why. Screenshots help a lot
   for anything that alters the dashboard.

```sh
yarn tsc              # type-check the whole repo
yarn test:all         # unit tests with coverage
yarn lint:all         # eslint across all packages
yarn prettier:fix     # formatting
```

## Reporting a bug

Open an issue at
[github.com/CodeVerse-GP/adoption-analytics/issues](https://github.com/CodeVerse-GP/adoption-analytics/issues).

Please include:

- **What you expected and what happened instead.** A screenshot for dashboard
  issues, the exact error text for anything else.
- **Which package** — frontend, backend or common.
- **Versions** — Backstage (see [backstage.json](backstage.json), currently
  1.53.1), Node.
- **Relevant config**, with secrets removed. The `adoptionAnalytics:` block is
  usually the interesting part.
- **Backend logs** around the failure. Most dashboard problems (`404`, empty
  charts, permission panels) are visible there.

## Feature requests

Open an issue describing the feature.
