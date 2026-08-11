import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const syncStatus = v.union(
  // Local content changed (or a retry is due) and a push to SiteGPT is
  // scheduled or in flight.
  v.literal('pending'),
  // The SiteGPT knowledge document matches the last content handed to
  // syncDocument.
  v.literal('synced'),
  // Removal was requested; the remote document still needs deleting.
  v.literal('deleting'),
  // Gave up after MAX_ATTEMPTS pushes. Terminal until the next
  // syncDocument/removeDocument/retrySync call for this key.
  v.literal('failed'),
)

export default defineSchema({
  // Shadow table for the transactional knowledge sync: one row per
  // (chatbotId, key) the host app has asked us to mirror into the SiteGPT
  // knowledge base. The row is the durable outbox entry; `content` holds the
  // pending payload until it is pushed, then is cleared to keep rows small.
  syncedDocuments: defineTable({
    chatbotId: v.string(),
    key: v.string(),
    name: v.optional(v.string()),
    status: syncStatus,
    contentHash: v.string(),
    content: v.optional(v.string()),
    // SiteGPT knowledge document id once the first push has created it.
    documentId: v.optional(v.string()),
    attempts: v.float64(),
    lastError: v.optional(v.string()),
    updatedAt: v.float64(),
    // When the row is next eligible for a push (undefined = not scheduled,
    // i.e. synced or failed).
    nextAttemptAt: v.optional(v.float64()),
    // Claim marker: a push worker holds the row until this timestamp. Rows
    // with a live lease are skipped by the claimer; mark* handlers clear it.
    leasedUntil: v.optional(v.float64()),
  })
    .index('by_chatbot_key', ['chatbotId', 'key'])
    .index('by_status_attempt', ['status', 'nextAttemptAt']),
})
