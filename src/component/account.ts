import { v } from 'convex/values'

import { action } from './_generated/server.js'
import { sitegptRequest } from './lib/http.js'

/** The authenticated user and token metadata. Good for verifying setup. */
export const me = action({
  args: {},
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async () => sitegptRequest({ method: 'GET', path: '/api/v2/me' }),
})

/** Current-window usage vs quotas for the account. */
export const usage = action({
  args: {},
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async () => sitegptRequest({ method: 'GET', path: '/api/v2/usage' }),
})

/** Plan limits and per-chatbot assignments. */
export const limits = action({
  args: {},
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async () => sitegptRequest({ method: 'GET', path: '/api/v2/limits' }),
})

/** List the account's chatbots. */
export const listChatbots = action({
  args: {},
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async () => sitegptRequest({ method: 'GET', path: '/api/v2/chatbots' }),
})

/** Fetch one chatbot. */
export const getChatbot = action({
  args: { chatbotId: v.string() },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, args) =>
    sitegptRequest({
      method: 'GET',
      path: `/api/v2/chatbots/${encodeURIComponent(args.chatbotId)}`,
    }),
})
