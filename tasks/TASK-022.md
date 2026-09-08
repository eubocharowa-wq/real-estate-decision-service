# TASK-022 — GitHub Pages static preview

## Goal

Publish a review-only static rendering of the public site from the current Next.js application at the repository's GitHub Pages project URL.

## Scope

- keep the production Next.js configuration unchanged on `main`;
- build from the dedicated `codex/github-pages-static-preview` branch;
- export only the public informational route group;
- exclude API routes, PostgreSQL-backed flows, dynamic property/expert routes and internal buyer-journey screens from the Pages artifact;
- apply the repository project base path `/real-estate-decision-service`;
- prevent search-engine indexing of the review deployment;
- deploy through GitHub Actions to GitHub Pages.

## Acceptance criteria

- the Pages workflow uses the repository Node version from `.nvmrc`;
- `npm ci` and the static Next.js build complete successfully;
- the uploaded Pages artifact contains `index.html`;
- the public landing and informational pages open under the project URL;
- CSS, fonts, links and client JavaScript load under the project base path;
- `robots.txt` disallows indexing;
- no API, database, parsing or expert-workbench behavior is claimed to work on GitHub Pages;
- the normal production build remains unchanged outside the preview branch.

## Verification

- GitHub Actions Pages build and deployment jobs are green;
- the generated Pages URL opens successfully;
- primary public navigation is checked from the deployed URL.

## Known limitation

GitHub Pages is static hosting. This task exposes a visual review build only; it does not deploy the complete Real Estate Decision Service backend.
