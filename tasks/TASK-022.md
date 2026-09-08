# TASK-022 — GitHub Pages static preview

## Goal

Publish a review-only static rendering of the public site from the current Next.js application at the repository's GitHub Pages project URL.

## Scope

- keep the production Next.js configuration unchanged;
- build the preview after pushes to `main` and by manual workflow dispatch;
- export the public informational route group;
- replace the server-backed comparison route with an honest static overview so public navigation has no dead link;
- exclude API routes, PostgreSQL-backed flows, dynamic property/expert routes and internal buyer-journey screens from the Pages artifact;
- apply the repository project base path `/real-estate-decision-service`;
- prevent search-engine indexing of the review deployment;
- deploy through GitHub Actions to GitHub Pages.

## Acceptance criteria

- the Pages workflow uses the repository Node version from `.nvmrc`;
- `npm ci` and the static Next.js build complete successfully;
- the uploaded Pages artifact contains `index.html`;
- the public landing and informational pages open under the project URL;
- the public `/comparison/` link opens a static capability overview rather than a 404 page;
- CSS, fonts, links and client JavaScript load under the project base path;
- `robots.txt` disallows indexing;
- no API, database, parsing or expert-workbench behavior is claimed to work on GitHub Pages;
- the guarded preview preparation does not change the normal production build.

## Verification

- GitHub Actions Pages build and deployment jobs are green;
- the generated Pages URL opens successfully;
- primary public navigation is checked from the deployed URL;
- the landing page and comparison overview are checked in a live browser.

## Known limitation

GitHub Pages is static hosting. This task exposes a visual review build only; it does not deploy the complete Real Estate Decision Service backend.
