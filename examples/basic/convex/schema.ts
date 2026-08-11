import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  // The app's own content. Each article is mirrored into the SiteGPT
  // knowledge base by the mutations in articles.ts.
  articles: defineTable({
    slug: v.string(),
    title: v.string(),
    body: v.string(),
    updatedAt: v.float64(),
  }).index('by_slug', ['slug']),
})
