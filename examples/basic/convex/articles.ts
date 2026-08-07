import { SiteGPT } from '@sitegpt/convex'
import { v } from 'convex/values'

import { components } from './_generated/api'
import { mutation, query } from './_generated/server'

const sitegpt = new SiteGPT(components.sitegpt, {
  defaultChatbotId: 'YOUR_CHATBOT_ID',
})

/**
 * Save an article AND its knowledge-base mirror in one transaction. If this
 * mutation rolls back, neither the article nor the sync intent is written;
 * if it commits, the chatbot learns the new content within moments.
 */
export const save = mutation({
  args: {
    slug: v.string(),
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const existing = await ctx.db
      .query('articles')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique()
    if (existing === null) {
      await ctx.db.insert('articles', { ...args, updatedAt: now })
    } else {
      await ctx.db.patch(existing._id, {
        title: args.title,
        body: args.body,
        updatedAt: now,
      })
    }

    await sitegpt.syncDocument(ctx, {
      key: `articles/${args.slug}`,
      name: args.title,
      content: `# ${args.title}\n\n${args.body}`,
    })
  },
})

/** Delete an article; the chatbot forgets it too. */
export const remove = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('articles')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique()
    if (existing !== null) {
      await ctx.db.delete(existing._id)
    }
    await sitegpt.removeDocument(ctx, { key: `articles/${args.slug}` })
  },
})

/** Live sync status for an article, subscribable from the client. */
export const syncState = query({
  args: { slug: v.string() },
  handler: async (ctx, args) =>
    sitegpt.getSyncState(ctx, { key: `articles/${args.slug}` }),
})
