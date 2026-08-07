# Convex Components Directory Submission

Everything the [submit form](https://www.convex.dev/components) asks for,
prepared in advance. Internal file: not shipped in the npm package.

## Form fields

| Field | Value |
| --- | --- |
| Component Name | `SiteGPT` |
| GitHub Repo URL | `https://github.com/sitegpt/convex-component` (must be PUBLIC at submission time) |
| npm package name | `@sitegpt/convex` (must be PUBLISHED at submission time; see PUBLISHING.md) |
| Live Demo URL or Example App | `https://github.com/sitegpt/convex-component/tree/main/examples/basic` (swap for a hosted demo URL if we build one) |
| Category | Closest fit in the dropdown, likely `AI` (or `Integrations` if AI is agent-framework-only) |
| Short Description (max 160 chars) | `Ask your SiteGPT AI support chatbot from Convex actions and keep its knowledge base transactionally in sync with your Convex tables.` (132 chars) |
| Tags | `ai, chatbot, customer-support, rag, knowledge-base, sync` |
| Video URL | none yet (optional) |
| Logo | `assets/logo.svg` (mark) or `assets/logo-full.svg` (wordmark); SVG accepted |
| Component Thumbnail | PENDING: 16:9, 1536x864 .webp/.png/.jpg, max 3MB, recommended for companies; needs a design pass |
| Your Name | Bhanu Teja Pachipulusu |
| Email | bhanu@sitegpt.ai (not displayed publicly) |
| Discord Username | optional |

The form's "Generate Component Directory Content" step builds the
description / use cases / "how it works" from the README, which is written to
serve as the listing page. Editable fallback copy:

**Use cases**

- In-app "Ask AI" help backed by your product's support chatbot
- Ticket deflection: answer from the knowledge base before opening a ticket
- Keep the chatbot's knowledge transactionally in sync with docs/FAQ/product
  tables that already live in Convex
- Build custom dashboards over conversations and leads inside your own app

**How it works**

The component wraps SiteGPT's v2 agent API behind typed Convex actions
(Bearer token via component-bound env). The knowledge sync feature stores a
shadow row per synced key in the component's own table: `syncDocument()`
called inside a host mutation commits atomically with the host's write, then
a lease-claimed outbox worker pushes the create/update/delete to SiteGPT
with hash-based change detection, exponential backoff, and
reassert-on-wake convergence for mid-flight edits and deletes.

## Submission checklist (from the form + FAQ)

- [ ] Run the preflight check on the submit page ("validate your repo against
      our review criteria") once the repo is public
- [ ] Repo public
- [ ] Package published on npm
- [ ] "I have read the Frequently Asked Questions"
- [ ] "This component complies with the Authoring Components guidelines"
      (see compliance notes below)
- [ ] "I have permission to submit this component" (we own it)

## Authoring-guidelines compliance notes

Mapped to https://docs.convex.dev/components/authoring:

- Structure: `src/component/` with `convex.config.ts`, `schema.ts`,
  `_generated/`; client class in `src/index.ts`; test helper at `./test`.
- package.json: template-shaped exports map (`.`, `./convex.config`,
  `./_generated/component`, `./test`, `./package.json`), `convex` as a peer
  dependency, single root package.json, `files: [dist, src, README.md]`.
- Functions: argument validators AND return validators on every function
  (passthroughs return `v.any()`, documented raw API payloads; sync engine
  returns precise validators). Internal engine functions are `internal*`.
- Env: declared in `defineComponent` (`SITEGPT_API_TOKEN`,
  optional `SITEGPT_API_BASE`), bound by the host via `app.use(..., { env })`,
  read through the typed `env` export. No `ctx.auth` anywhere in the
  component.
- Pagination: keyset via bounded `take()` (native `.paginate()` throws inside
  components).
- Tests: convex-test suite (31 tests) incl. the sync state machine, races,
  and liveness; test helper is a static module map so it works from the
  published dist.
- Example app: `examples/basic` (convex.config, schema, two feature modules,
  its own tsconfig). Needs `npx convex dev` once to generate `_generated/`.
- Docs: README with install, quickstart for both features, API table, token
  scope table, error handling, testing, FAQ.
- Publishing: PUBLISHING.md + tag-triggered publish workflow
  (`NPM_TOKEN` secret required).
