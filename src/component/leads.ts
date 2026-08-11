import { v } from 'convex/values'

import { action } from './_generated/server.js'
import { chatbotPath, sitegptRequest } from './lib/http.js'

/** List leads captured by the chatbot, cursor-paginated. */
export const list = action({
  args: {
    chatbotId: v.string(),
    // The API filters archived vs open leads via status, not a boolean.
    status: v.optional(
      v.union(v.literal('all'), v.literal('archived'), v.literal('open')),
    ),
    query: v.optional(v.string()),
    important: v.optional(v.boolean()),
    limit: v.optional(v.float64()),
    cursor: v.optional(v.string()),
  },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, args) =>
    sitegptRequest({
      method: 'GET',
      path: chatbotPath(args.chatbotId, '/leads'),
      query: {
        status: args.status,
        query: args.query,
        important: args.important === undefined ? undefined : String(args.important),
        limit: args.limit,
        cursor: args.cursor,
      },
    }),
})

/** Fetch one lead by id. */
export const get = action({
  args: {
    chatbotId: v.string(),
    leadId: v.string(),
  },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, args) =>
    sitegptRequest({
      method: 'GET',
      path: chatbotPath(args.chatbotId, `/leads/${encodeURIComponent(args.leadId)}`),
    }),
})
