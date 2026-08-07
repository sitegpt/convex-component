# Basic example

A minimal Convex app using `@sitegpt/convex` two ways:

- `convex/articles.ts` keeps an `articles` table transactionally mirrored
  into a SiteGPT chatbot's knowledge base (`syncDocument` / `removeDocument`),
  with a subscribable `syncState` query.
- `convex/support.ts` exposes an `ask` action: an in-app "Ask AI" box backed
  by the same chatbot.

## Run it

```bash
npm install
npx convex dev            # generates convex/_generated
npx convex env set SITEGPT_API_TOKEN sgpt_...
```

Replace `YOUR_CHATBOT_ID` in `articles.ts` and `support.ts` with a chatbot id
from your SiteGPT dashboard, then:

```bash
npx convex run articles:save '{"slug": "refunds", "title": "Refund policy", "body": "We refund within 30 days."}'
npx convex run articles:syncState '{"slug": "refunds"}'
npx convex run support:ask '{"question": "What is the refund policy?"}'
```
