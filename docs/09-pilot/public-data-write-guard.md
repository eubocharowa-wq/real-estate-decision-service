# Public data write guard

GitHub Issue #29 adds a runtime boundary that is separate from banners,
`noindex`, deployment protection, and `pilot:release-gate`. A release gate with
`ready=false` does not by itself stop `/api/buyer-journeys`; this server policy
does.

## Write-boundary inventory

| HTTP boundary | Action | Persistent effect | Guard |
| --- | --- | --- | --- |
| `POST /api/buyer-journeys` | `start_and_parse` | journey, original request, parser result, audit | required |
| same | confirm, shortlist, property, comparison, selection | journey/matching/comparison/audit state | required |
| same | `add_user_url` | imported candidate and recompute state | required |
| same | `create_expert_request` | expert request/context | required |
| same | `submit_feedback` | feedback record | required |
| same | `journey_state`, `snapshot` | read-only | not required; failures are not recorded |
| `POST /api/expert-requests` | create/queue | expert request/context/audit | required |
| `POST /api/expert-workbench/:id` | all actions, including result view | draft/result/status/audit | required |
| `GET /expert/requests/:id` | open workbench | initial draft and audit | required |
| `POST /api/user-url-ingestion` | preview/normalize | transient response; no repository write | no write guard |
| request/parser, shortlist, property-detail and comparison read APIs | read/derive | no repository write | no write guard |

There is no user-upload HTTP route in the current repository. Any future
upload boundary must pass an equivalent server policy before object storage or
metadata persistence.

## Server configuration

Missing or unrecognised configuration denies writes.

- `disabled`: explicit denial;
- `approved_public`: requires a non-empty server-only
  `REDS_PUBLIC_DATA_PROCESSING_APPROVAL_REF`;
- `trusted_pilot`: requires Vercel Preview, pilot application mode, and the
  server-side `vercel_sso` trusted-access attestation;
- `synthetic_test`: valid only when the trusted process runtime is
  `NODE_ENV=test`.

The guard never reads request headers, cookies, query parameters, or body
flags. Vercel protection remains independently required for a trusted pilot;
the application variable is not a replacement for SSO. No current public or
production environment is claimed to be privacy-approved by this change.

Denial occurs before application/repository construction and returns a fixed
`PUBLIC_DATA_WRITE_DISABLED` response. Submitted text, environment values,
approval references, and database details are not returned or persisted.

When the dynamic runtime is denied, `/selection` and `/expert/request` render
a fixed closed-state notice instead of an input form. The GitHub Pages export
keeps its separate design-preview form, but the control remains disabled and
cannot submit because the static export contains no API routes.
