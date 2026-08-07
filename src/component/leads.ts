import { v } from 'convex/values'

import { action } from './_generated/server.js'
import { chatbotPath, sitegptRequest } from './lib/http.js'

/** List leads captured by the chatbot, cursor-paginated. */
export const list = action({
  args: {
    chatbotId: v.string(),
    query: v.optional(v.string()),
    important: v.optional(v.boolean()),
    archived: v.optional(v.boolean()),
    limit: v.optional(v.float64()),
    cursor: v.optional(v.string()),
  },
  handler: async (_ctx, args) =>
    sitegptRequest({
      method: 'GET',
      path: chatbotPath(args.chatbotId, '/leads'),
      query: {
        query: args.query,
        important: args.important === undefined ? undefined : String(args.important),
        archived: args.archived === undefined ? undefined : String(args.archived),
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
  handler: async (_ctx, args) =>
    sitegptRequest({
      method: 'GET',
      path: chatbotPath(args.chatbotId, `/leads/${encodeURIComponent(args.leadId)}`),
    }),
})
