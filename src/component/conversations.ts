import { v } from 'convex/values'

import { action } from './_generated/server.js'
import { chatbotPath, sitegptRequest } from './lib/http.js'

/** List conversations with cursor pagination and filters. */
export const list = action({
  args: {
    chatbotId: v.string(),
    status: v.optional(v.string()),
    mode: v.optional(v.string()),
    escalated: v.optional(v.boolean()),
    important: v.optional(v.boolean()),
    read: v.optional(v.boolean()),
    leadId: v.optional(v.string()),
    tagIds: v.optional(v.array(v.string())),
    reaction: v.optional(v.string()),
    query: v.optional(v.string()),
    includeEmpty: v.optional(v.boolean()),
    limit: v.optional(v.float64()),
    cursor: v.optional(v.string()),
  },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, args) =>
    sitegptRequest({
      method: 'GET',
      path: chatbotPath(args.chatbotId, '/conversations'),
      query: {
        status: args.status,
        mode: args.mode,
        escalated: args.escalated === undefined ? undefined : String(args.escalated),
        important: args.important === undefined ? undefined : String(args.important),
        read: args.read === undefined ? undefined : String(args.read),
        leadId: args.leadId,
        tagId: args.tagIds,
        reaction: args.reaction,
        query: args.query,
        includeEmpty:
          args.includeEmpty === undefined ? undefined : String(args.includeEmpty),
        limit: args.limit,
        cursor: args.cursor,
      },
    }),
})

/** Fetch one conversation by thread id. */
export const get = action({
  args: {
    chatbotId: v.string(),
    threadId: v.string(),
  },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, args) =>
    sitegptRequest({
      method: 'GET',
      path: chatbotPath(
        args.chatbotId,
        `/conversations/${encodeURIComponent(args.threadId)}`,
      ),
    }),
})

/** List the messages in a conversation, oldest-first, cursor-paginated. */
export const listMessages = action({
  args: {
    chatbotId: v.string(),
    threadId: v.string(),
    limit: v.optional(v.float64()),
    cursor: v.optional(v.string()),
  },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, args) =>
    sitegptRequest({
      method: 'GET',
      path: chatbotPath(
        args.chatbotId,
        `/conversations/${encodeURIComponent(args.threadId)}/messages`,
      ),
      query: { limit: args.limit, cursor: args.cursor },
    }),
})
