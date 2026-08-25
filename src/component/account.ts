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

/**
 * Daily engagement analytics for a chatbot: widget opens, messages,
 * conversations started, unique visitors, escalations, and leads, with
 * totals and a prior-period comparison. Requires the analytics
 * entitlement (the API answers 403 ANALYTICS_LOCKED otherwise);
 * insight-derived counters appear only when insights is enabled.
 */
export const getChatbotAnalytics = action({
  args: {
    chatbotId: v.string(),
    // UTC calendar days (YYYY-MM-DD); the API defaults to the
    // trailing 30 days when omitted.
    startDay: v.optional(v.string()),
    endDay: v.optional(v.string()),
  },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, args) =>
    sitegptRequest({
      method: 'GET',
      path: `/api/v2/chatbots/${encodeURIComponent(args.chatbotId)}/analytics`,
      query: { startDay: args.startDay, endDay: args.endDay },
    }),
})
