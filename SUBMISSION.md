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
| Category | `AI Agents` (decided 2026-08-12 from the live category pages: that shelf already holds vendor API wrappers and finished agents — Exa, Firecrawl, DatabaseChat — and customers describe SiteGPT as an "AI customer support agent", so it is the shelf buyers browse. AI Infrastructure is explicitly "primitives"; Integrations is the PostHog/SES glue shelf) |
| Short Description (max 160 chars) | `Ask your SiteGPT AI support chatbot from Convex actions and keep its knowledge base transactionally in sync with your Convex tables.` (132 chars) |
| Tags | `ai, chatbot, customer-support, rag, knowledge-base, sync` |
| Video URL | none yet (optional) |
| Logo | `assets/logo.svg` (mark) or `assets/logo-full.svg` (wordmark); SVG accepted |
| Component Thumbnail | `assets/og-image.jpg` (the sitegpt.ai OG image, 2400x1260). Note: 1.90:1, slightly wider than the recommended 16:9; pad to 1536x864 if their preview crops badly |
| Your Name | Bhanu Teja Pachipulusu |
| Email | bhanu@sitegpt.ai (not displayed publicly) |
| Discord Username | optional |

The form's "Generate Component Directory Content" step autogenerates from the
README; the blocks below are the EDITED versions actually submitted
(2026-08-12) — value-first description, scenario-first use cases, mechanism
kept in How it Works.

**Description**

SiteGPT gives your product an AI support agent trained on your own content. This component connects it to your Convex backend in both directions: call `sitegpt.ask()` from an action to get grounded answers inside your app, and call `sitegpt.syncDocument()` inside your mutations to keep the agent's knowledge base transactionally in sync with your Convex tables. Content that commits is content the bot knows: no cron jobs, no drift, no manual re-uploads. Typed helpers cover the rest of the SiteGPT API: knowledge ingestion, documents, conversations, messages, and leads.

**Use Cases**

- An in-app "Ask AI" box: send the user's question from a Convex action with `sitegpt.ask()` and render the grounded answer, with a `threadId` for follow-up questions
- Ticket deflection: answer from the knowledge base first, and escalate to your human inbox only when the bot cannot help
- Docs, FAQs, or product data that already live in Convex tables: `sitegpt.syncDocument()` in the same mutation that saves a row keeps the bot current, and `sitegpt.removeDocument()` makes it forget deleted content
- Live sync dashboards: `sitegpt.getSyncState()` is a subscribable query, so your admin UI can show each document's push status in real time
- Custom support analytics: page through conversations, messages, and captured leads with typed helpers and build your own views inside your app

**How it Works**

Mount the component in `convex.config.ts` with `app.use(sitegpt, ...)` and bind a `SITEGPT_API_TOKEN` from your SiteGPT dashboard. Create the `SiteGPT` client with an optional `defaultChatbotId`, then call its methods from your functions. API-backed methods (ask, ingestion, conversations, leads) run in actions; sync methods run in mutations and queries.

`sitegpt.ask()` calls the SiteGPT API, which generates the answer in the same request: one call returns the reply and a `threadId` you can pass back to continue the conversation. Conversations appear in the SiteGPT dashboard like any other chat, so escalation, history, and analytics keep working.

The knowledge sync is transactional. `sitegpt.syncDocument()` records the intended content in the component's own table, inside your mutation's transaction, so the intent commits or rolls back together with your own writes. After commit, a background worker pushes the change to SiteGPT: the first push creates a knowledge document, later pushes update it in place, and `removeDocument()` deletes it. Unchanged content is detected by hash and skipped, deletions are pushed ahead of updates, and failures retry with exponential backoff (5s doubling to about 5 minutes, 8 attempts) before the row is marked `failed` for `retrySync()`.

API errors throw a `ConvexError` whose data carries `status`, `code`, and `message`. Sync failures never surface into your mutations after commit; they are recorded on the sync row as `lastError` and observable through `sitegpt.getSyncState()`.

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
- Publishing: PUBLISHING.md + tag-triggered publish workflow. No stored
  npm token: trusted publishing (OIDC) + staged publishing (each release
  needs a maintainer's 2FA approval) + provenance. First publish is local;
  see PUBLISHING.md.
