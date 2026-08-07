# SiteGPT Convex Component

[![npm version](https://img.shields.io/npm/v/@sitegpt/convex.svg)](https://www.npmjs.com/package/@sitegpt/convex)

Add an AI support agent to your Convex app, powered by [SiteGPT](https://sitegpt.ai).

Two things this component gives you:

1. **Ask your chatbot from server functions.** Call `sitegpt.ask(ctx, ...)` in an action and get the AI answer back, grounded in your chatbot's knowledge base. Build in-app help, ticket deflection, internal tools, or agent workflows without touching the widget.
2. **Transactional knowledge sync.** Your product content already lives in Convex tables. Call `sitegpt.syncDocument(ctx, ...)` inside the same mutation that writes your data, and the chatbot's knowledge base follows automatically: the sync intent commits atomically with your write, a background worker pushes it to SiteGPT with retries, and deleting the row makes the bot forget it. No cron jobs, no drift.

Plus typed helpers for the rest of the SiteGPT API: knowledge ingestion (links, sitemaps, crawls, files, YouTube), conversations, messages, and leads.

## Prerequisites

- A [SiteGPT](https://sitegpt.ai) account with a chatbot. No account yet? `npx @sitegpt/cli onboarding start <your-website>` creates a working preview chatbot without signing up.
- A SiteGPT API token: create one in the dashboard under Settings, or with `sitegpt tokens create`.

## Installation

```bash
npm install @sitegpt/convex
```

Mount the component and bind the token in `convex/convex.config.ts`:

```ts
import sitegpt from '@sitegpt/convex/convex.config.js'
import { defineApp } from 'convex/server'
import { v } from 'convex/values'

const app = defineApp({
  env: { SITEGPT_API_TOKEN: v.string() },
})

app.use(sitegpt, {
  env: { SITEGPT_API_TOKEN: app.env.SITEGPT_API_TOKEN },
})

export default app
```

Set the token on your deployment:

```bash
npx convex env set SITEGPT_API_TOKEN sgpt_...
```

Then create the client anywhere in your `convex/` functions:

```ts
import { SiteGPT } from '@sitegpt/convex'
import { components } from './_generated/api'

const sitegpt = new SiteGPT(components.sitegpt, {
  defaultChatbotId: 'your-chatbot-id', // optional, saves passing it per call
})
```

## Ask the chatbot

The SiteGPT API generates the answer synchronously, so one action call returns the reply:

```ts
import { action } from './_generated/server'
import { v } from 'convex/values'

export const askSupport = action({
  args: { question: v.string(), threadId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const result = await sitegpt.ask(ctx, {
      message: args.question,
      threadId: args.threadId, // omit to start a new conversation
    })
    return { answer: result.answer, threadId: result.threadId }
  },
})
```

Pass the returned `threadId` on the next call to continue the same conversation. Conversations show up in your SiteGPT dashboard like any other chat, so escalation, history, and analytics keep working.

## Transactional knowledge sync

Keep the chatbot's knowledge in lockstep with a Convex table by syncing in the same mutation that writes it:

```ts
export const saveArticle = mutation({
  args: { slug: v.string(), title: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    // ... write the article to your own table ...

    await sitegpt.syncDocument(ctx, {
      key: `articles/${args.slug}`,      // your stable identifier
      name: args.title,                  // display name in the dashboard
      content: `# ${args.title}\n\n${args.body}`,
    })
  },
})

export const deleteArticle = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    // ... delete the article from your own table ...
    await sitegpt.removeDocument(ctx, { key: `articles/${args.slug}` })
  },
})
```

How it works:

- `syncDocument` writes a shadow row in the component's own table. Because component mutations join your mutation's transaction, the intent commits atomically with your write. If your mutation throws, nothing is recorded.
- A scheduled worker pushes the change to SiteGPT right after commit: first push creates a knowledge document, later pushes update it in place (content is re-embedded automatically), `removeDocument` deletes it.
- Unchanged content is detected by hash and skipped, so calling `syncDocument` on every save is free.
- Failures retry with exponential backoff, doubling from 5s (5s, 10s, 20s, ... up to ~5 minutes between tries). After 8 attempts the row is marked `failed` and left alone until the next `syncDocument`, `removeDocument`, or `retrySync` for that key.
- Everything reasserts state on wake-up: if content changes while a push is in flight, or a delete lands mid-create, the worker converges to the latest intent.

Observe sync state live from a query (it is subscribable like any Convex query):

```ts
export const articleSyncState = query({
  args: { slug: v.string() },
  handler: async (ctx, args) =>
    sitegpt.getSyncState(ctx, { key: `articles/${args.slug}` }),
})
```

Limits worth knowing:

- One synced document holds up to 900 KB of UTF-8 content. Split bigger sources into multiple keys (that also improves retrieval).
- Pushes run in batches of 10; a bulk import of thousands of documents drains steadily rather than instantly. Deletions are prioritized over content updates so takedowns never wait behind churn.

## API surface

All API-backed methods run in actions (they call the SiteGPT REST API). Sync methods run in mutations and queries.

| Area | Methods |
| --- | --- |
| Chat | `ask` |
| Knowledge sync | `syncDocument`, `removeDocument`, `retrySync`, `getSyncState`, `listSyncStates` |
| Knowledge ingestion | `addLinks`, `addSitemap`, `crawlWebsite`, `addYoutube`, `uploadFiles`, `setCustomText` |
| Knowledge documents | `listDocuments`, `getDocument`, `updateDocumentContent`, `deleteDocument`, `deleteDocuments`, `resyncDocuments`, `getDocumentStats` |
| Conversations | `listConversations`, `getConversation`, `listMessages` |
| Leads | `listLeads`, `getLead` |
| Account | `me`, `usage`, `limits`, `listChatbots`, `getChatbot` |

You can also call the component actions directly via `ctx.runAction(components.sitegpt.knowledge.addLinks, ...)` if you prefer not to use the client class.

### Token scopes

Create the API token with the scopes for the methods you use:

| Methods | Scope |
| --- | --- |
| `ask` | `conversations:write` |
| `listConversations`, `getConversation`, `listMessages` | `conversations:read` |
| Knowledge sync + ingestion + document writes | `knowledge:write` |
| `listDocuments`, `getDocument`, `getDocumentStats` | `knowledge:read` |
| `listLeads`, `getLead` | `leads:read` |
| `me`, `usage`, `limits` | `account:read` |
| `listChatbots`, `getChatbot` | `chatbots:read` |

## Error handling

API failures throw a `ConvexError` whose `data` carries `{ kind: 'SiteGptApiError', status, code, message, hint? }`. The sync worker catches these itself and records them on the row (`lastError`), so sync never throws into your mutations after commit.

## Testing

The package ships a convex-test helper:

```ts
import { convexTest } from 'convex-test'
import sitegptTest from '@sitegpt/convex/test'

const t = convexTest(schema, modules)
sitegptTest.register(t)
```

Stub `fetch` to fake the SiteGPT API; see this repo's `tests/sync.test.ts` for full examples, including the sync state machine.

## Example

A runnable example app lives in [`examples/basic`](./examples/basic): an `articles` table mirrored into a chatbot plus an in-app ask endpoint.

## FAQ

**Does this store my data in Convex?** Only the sync engine stores state: one shadow row per synced key. Content is held in the row until pushed, then cleared; a `failed` row keeps its content so `retrySync` can push it later. The API wrapper methods store nothing.

**Can I sync multiple chatbots?** Yes. Every method takes an optional `chatbotId`; `defaultChatbotId` is just a convenience.

**What happens if SiteGPT is down during a sync?** The intent is already durable in the shadow row, so nothing is lost: the worker retries with backoff and converges when the API is reachable again.

**Which plans can use this?** Any plan with API access. Rate limits follow your SiteGPT plan.

## License

MIT
