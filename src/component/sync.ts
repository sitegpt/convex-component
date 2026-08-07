import { ConvexError, v } from 'convex/values'

import { internal } from './_generated/api.js'
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server.js'
import type { Doc, Id } from './_generated/dataModel.js'
import type { MutationCtx } from './_generated/server.js'
import { base64FromUtf8, contentHash, toFileName } from './lib/encoding.js'
import {
  chatbotPath,
  errorText,
  isSiteGptApiError,
  sitegptRequest,
} from './lib/http.js'

/**
 * Transactional knowledge sync.
 *
 * The host app calls `upsert`/`remove` from inside its own mutations (via the
 * SiteGPT client class). Because component mutations join the caller's
 * transaction, the shadow row here commits atomically with the host's write:
 * if the host mutation rolls back, so does the sync intent. The actual HTTP
 * push happens afterwards through a transactional outbox:
 *
 *   upsert/remove ──▶ row status 'pending'/'deleting', kick scheduled
 *   kick (mutation) ──▶ claims due rows (lease), schedules push
 *   push (action)   ──▶ create/update/delete against the SiteGPT API
 *   markSynced/markDeleted/markFailed ──▶ record the outcome, re-kick if the
 *     world changed mid-flight (content updated, delete requested, ...)
 *
 * Every wake-up re-reads the row and reasserts state before acting; retries
 * back off exponentially and give up at MAX_ATTEMPTS (status 'failed',
 * revivable via `retry` or the next `upsert`).
 */

const BATCH = 10
const LEASE_MS = 5 * 60_000
const MAX_ATTEMPTS = 8
const BACKOFF_BASE_MS = 5_000
const BACKOFF_MAX_MS = 60 * 60_000
// Convex documents cap at ~1 MiB; the pending payload lives in the row until
// pushed, so keep headroom for the other fields.
const MAX_CONTENT_CHARS = 900_000
const MAX_KEY_CHARS = 512
const MAX_NAME_CHARS = 120

export type SyncStateStatus = 'pending' | 'synced' | 'deleting' | 'failed'

export type SyncState = {
  key: string
  name: string | null
  status: SyncStateStatus
  documentId: string | null
  contentHash: string
  attempts: number
  lastError: string | null
  updatedAt: number
  nextAttemptAt: number | null
  hasPendingContent: boolean
}

function toSyncState(row: Doc<'syncedDocuments'>): SyncState {
  return {
    key: row.key,
    name: row.name ?? null,
    status: row.status,
    documentId: row.documentId ?? null,
    contentHash: row.contentHash,
    attempts: row.attempts,
    lastError: row.lastError ?? null,
    updatedAt: row.updatedAt,
    nextAttemptAt: row.nextAttemptAt ?? null,
    hasPendingContent: row.content !== undefined,
  }
}

async function findRow(
  ctx: { db: MutationCtx['db'] },
  chatbotId: string,
  key: string,
): Promise<Doc<'syncedDocuments'> | null> {
  return await ctx.db
    .query('syncedDocuments')
    .withIndex('by_chatbot_key', (q) => q.eq('chatbotId', chatbotId).eq('key', key))
    .unique()
}

function scheduleKick(ctx: MutationCtx, delayMs = 0): Promise<Id<'_scheduled_functions'>> {
  return ctx.scheduler.runAfter(delayMs, internal.sync.kick, {})
}

function isLeased(row: Doc<'syncedDocuments'>, now: number): boolean {
  return row.leasedUntil !== undefined && row.leasedUntil > now
}

/**
 * Record that (chatbotId, key) should exist in the SiteGPT knowledge base
 * with exactly this content. Call from a host mutation, ideally the same one
 * that writes the source row. Idempotent: unchanged content is a no-op.
 */
export const upsert = mutation({
  args: {
    chatbotId: v.string(),
    key: v.string(),
    name: v.optional(v.string()),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.key.length === 0 || args.key.length > MAX_KEY_CHARS) {
      throw new ConvexError(
        `sync key must be 1..${MAX_KEY_CHARS} characters, got ${args.key.length}`,
      )
    }
    if (args.content.length > MAX_CONTENT_CHARS) {
      throw new ConvexError(
        `sync content is limited to ${MAX_CONTENT_CHARS} characters per document, got ${args.content.length}. Split the source into smaller documents.`,
      )
    }
    if (args.name !== undefined && args.name.length > MAX_NAME_CHARS) {
      throw new ConvexError(
        `sync name is limited to ${MAX_NAME_CHARS} characters, got ${args.name.length}`,
      )
    }

    const now = Date.now()
    const hash = contentHash(args.content)
    const existing = await findRow(ctx, args.chatbotId, args.key)

    if (existing === null) {
      await ctx.db.insert('syncedDocuments', {
        chatbotId: args.chatbotId,
        key: args.key,
        name: args.name,
        status: 'pending',
        contentHash: hash,
        content: args.content,
        attempts: 0,
        updatedAt: now,
        nextAttemptAt: now,
      })
      await scheduleKick(ctx)
      return { status: 'pending' as const, changed: true }
    }

    const nameChanged = args.name !== undefined && args.name !== existing.name
    const sameContent = existing.contentHash === hash

    if (sameContent && existing.status === 'synced') {
      if (nameChanged) {
        await ctx.db.patch(existing._id, { name: args.name, updatedAt: now })
      }
      return { status: 'synced' as const, changed: false }
    }

    if (sameContent && existing.status === 'pending') {
      // Already scheduled with this exact content; just refresh the name.
      if (nameChanged) {
        await ctx.db.patch(existing._id, { name: args.name, updatedAt: now })
      }
      return { status: 'pending' as const, changed: false }
    }

    // Content changed, or the row is failed/deleting and needs reviving.
    await ctx.db.patch(existing._id, {
      ...(args.name !== undefined ? { name: args.name } : {}),
      status: 'pending',
      contentHash: hash,
      content: args.content,
      attempts: 0,
      lastError: undefined,
      updatedAt: now,
      nextAttemptAt: now,
    })
    await scheduleKick(ctx)
    return { status: 'pending' as const, changed: true }
  },
})

/**
 * Record that (chatbotId, key) should no longer exist in the knowledge base.
 * Deletes the remote document (once pushed) and then the shadow row.
 */
export const remove = mutation({
  args: {
    chatbotId: v.string(),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const existing = await findRow(ctx, args.chatbotId, args.key)
    if (existing === null) {
      return { status: null, changed: false }
    }
    if (existing.status === 'deleting') {
      return { status: 'deleting' as const, changed: false }
    }
    if (existing.documentId === undefined && !isLeased(existing, now)) {
      // Never pushed and no push in flight: nothing exists remotely.
      await ctx.db.delete(existing._id)
      return { status: null, changed: true }
    }
    // Either the remote document exists, or a push that may create it is in
    // flight (leased). Mark the intent; the worker reasserts on wake.
    await ctx.db.patch(existing._id, {
      status: 'deleting',
      content: undefined,
      attempts: 0,
      lastError: undefined,
      updatedAt: now,
      nextAttemptAt: now,
    })
    await scheduleKick(ctx)
    return { status: 'deleting' as const, changed: true }
  },
})

/** Revive a terminally failed row and try again immediately. */
export const retry = mutation({
  args: {
    chatbotId: v.string(),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const existing = await findRow(ctx, args.chatbotId, args.key)
    if (existing === null || existing.status !== 'failed') {
      return { status: existing === null ? null : existing.status, changed: false }
    }
    if (existing.content !== undefined) {
      // A push (create or update) never landed; run it again.
      await ctx.db.patch(existing._id, {
        status: 'pending',
        attempts: 0,
        lastError: undefined,
        updatedAt: now,
        nextAttemptAt: now,
      })
      await scheduleKick(ctx)
      return { status: 'pending' as const, changed: true }
    }
    if (existing.documentId !== undefined) {
      // Content already pushed once and cleared; the only failable intent
      // left without content is a delete.
      await ctx.db.patch(existing._id, {
        status: 'deleting',
        attempts: 0,
        lastError: undefined,
        updatedAt: now,
        nextAttemptAt: now,
      })
      await scheduleKick(ctx)
      return { status: 'deleting' as const, changed: true }
    }
    // No content and no remote document: nothing left to do.
    await ctx.db.delete(existing._id)
    return { status: null, changed: true }
  },
})

/** Sync state for one key, or null if it was never synced (or fully removed). */
export const get = query({
  args: {
    chatbotId: v.string(),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('syncedDocuments')
      .withIndex('by_chatbot_key', (q) =>
        q.eq('chatbotId', args.chatbotId).eq('key', args.key),
      )
      .unique()
    return row === null ? null : toSyncState(row)
  },
})

/**
 * Page through sync states for a chatbot, ordered by key. Pass the previous
 * page's nextCursor to continue.
 */
export const list = query({
  args: {
    chatbotId: v.string(),
    cursor: v.optional(v.string()),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 50), 1), 100)
    const rows = await ctx.db
      .query('syncedDocuments')
      .withIndex('by_chatbot_key', (q) => {
        const scoped = q.eq('chatbotId', args.chatbotId)
        return args.cursor === undefined ? scoped : scoped.gt('key', args.cursor)
      })
      .take(limit + 1)
    const page = rows.slice(0, limit)
    const hasNextPage = rows.length > limit
    return {
      states: page.map(toSyncState),
      hasNextPage,
      nextCursor: hasNextPage ? page[page.length - 1]!.key : null,
    }
  },
})

/**
 * Claim due rows and hand them to the push worker. Leases (leasedUntil) keep
 * concurrent kicks from double-claiming; a watchdog kick after lease expiry
 * recovers rows whose worker died mid-push.
 */
export const kick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const due: Doc<'syncedDocuments'>[] = []
    for (const status of ['pending', 'deleting'] as const) {
      if (due.length >= BATCH) {
        break
      }
      const rows = await ctx.db
        .query('syncedDocuments')
        .withIndex('by_status_attempt', (q) =>
          q.eq('status', status).lte('nextAttemptAt', now),
        )
        .take(BATCH * 3)
      for (const row of rows) {
        if (isLeased(row, now)) {
          continue
        }
        due.push(row)
        if (due.length >= BATCH) {
          break
        }
      }
    }

    if (due.length === 0) {
      return { claimed: 0 }
    }

    for (const row of due) {
      await ctx.db.patch(row._id, { leasedUntil: now + LEASE_MS })
    }
    await ctx.scheduler.runAfter(0, internal.sync.push, {
      ids: due.map((row) => row._id),
    })
    // Watchdog: if the push action dies, re-claim after the lease expires.
    await scheduleKick(ctx, LEASE_MS + 10_000)
    if (due.length >= BATCH) {
      // There may be more due rows than one batch; keep draining.
      await scheduleKick(ctx, 1_000)
    }
    return { claimed: due.length }
  },
})

export const load = internalQuery({
  args: { id: v.id('syncedDocuments') },
  handler: async (ctx, args) => ctx.db.get(args.id),
})

/**
 * The outbox worker: performs the remote create/update/delete for each
 * claimed row, then records the outcome. Runs outside any transaction, so it
 * re-reads each row first and lets the mark* mutations reassert state.
 */
export const push = internalAction({
  args: { ids: v.array(v.id('syncedDocuments')) },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      const row = await ctx.runQuery(internal.sync.load, { id })
      if (row === null) {
        continue
      }
      if (row.status === 'pending') {
        if (row.content === undefined) {
          await ctx.runMutation(internal.sync.markFailed, {
            id,
            error: 'sync row has no pending content to push',
          })
          continue
        }
        try {
          let documentId = row.documentId
          if (documentId !== undefined) {
            try {
              await sitegptRequest({
                method: 'PATCH',
                path: chatbotPath(
                  row.chatbotId,
                  `/documents/${encodeURIComponent(documentId)}`,
                ),
                body: { content: row.content },
              })
            } catch (error) {
              if (!isSiteGptApiError(error, 404)) {
                throw error
              }
              // The document was deleted out from under us (e.g. in the
              // dashboard). Fall through and create a fresh one.
              documentId = undefined
            }
          }
          if (documentId === undefined) {
            const data = (await sitegptRequest({
              method: 'POST',
              path: chatbotPath(row.chatbotId, '/knowledge/files'),
              body: {
                files: [
                  {
                    name: toFileName(row.name ?? row.key),
                    type: 'text/markdown',
                    base64: base64FromUtf8(row.content),
                  },
                ],
              },
            })) as { documents?: { id?: string; error?: string | null }[] }
            const created = data.documents?.[0]
            if (!created?.id) {
              throw new ConvexError(
                `SiteGPT file upload returned no document id${
                  created?.error ? `: ${created.error}` : ''
                }`,
              )
            }
            documentId = created.id
          }
          await ctx.runMutation(internal.sync.markSynced, {
            id,
            documentId,
            pushedHash: row.contentHash,
          })
        } catch (error) {
          await ctx.runMutation(internal.sync.markFailed, {
            id,
            error: errorText(error),
          })
        }
      } else if (row.status === 'deleting') {
        try {
          if (row.documentId !== undefined) {
            try {
              await sitegptRequest({
                method: 'DELETE',
                path: chatbotPath(
                  row.chatbotId,
                  `/documents/${encodeURIComponent(row.documentId)}`,
                ),
                query: { confirm: 'true' },
              })
            } catch (error) {
              // Already gone remotely is success for a delete.
              if (!isSiteGptApiError(error, 404)) {
                throw error
              }
            }
          }
          await ctx.runMutation(internal.sync.markDeleted, { id })
        } catch (error) {
          await ctx.runMutation(internal.sync.markFailed, {
            id,
            error: errorText(error),
          })
        }
      }
      // Any other status: the world changed while we held the claim
      // (markSynced already ran, or an upsert reset things). Skip.
    }
  },
})

export const markSynced = internalMutation({
  args: {
    id: v.id('syncedDocuments'),
    documentId: v.string(),
    pushedHash: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id)
    if (row === null) {
      return
    }
    const now = Date.now()
    if (row.status === 'deleting') {
      // A remove landed while we were pushing; the remote document now
      // exists and must be deleted.
      await ctx.db.patch(row._id, {
        documentId: args.documentId,
        leasedUntil: undefined,
        nextAttemptAt: now,
        updatedAt: now,
      })
      await scheduleKick(ctx)
      return
    }
    if (row.contentHash !== args.pushedHash) {
      // The content changed mid-flight; keep the document id and push the
      // newer content (as an update this time).
      await ctx.db.patch(row._id, {
        documentId: args.documentId,
        status: 'pending',
        attempts: 0,
        leasedUntil: undefined,
        nextAttemptAt: now,
        updatedAt: now,
      })
      await scheduleKick(ctx)
      return
    }
    await ctx.db.patch(row._id, {
      documentId: args.documentId,
      status: 'synced',
      content: undefined,
      attempts: 0,
      lastError: undefined,
      leasedUntil: undefined,
      nextAttemptAt: undefined,
      updatedAt: now,
    })
  },
})

export const markDeleted = internalMutation({
  args: { id: v.id('syncedDocuments') },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id)
    if (row === null) {
      return
    }
    if (row.status === 'deleting') {
      await ctx.db.delete(row._id)
      return
    }
    // Re-upserted while the delete was in flight: the remote document is
    // gone, so clear the stale id and let the pending push recreate it.
    const now = Date.now()
    await ctx.db.patch(row._id, {
      documentId: undefined,
      leasedUntil: undefined,
      nextAttemptAt: now,
      updatedAt: now,
    })
    await scheduleKick(ctx)
  },
})

export const markFailed = internalMutation({
  args: {
    id: v.id('syncedDocuments'),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id)
    if (row === null) {
      return
    }
    const now = Date.now()
    const attempts = row.attempts + 1
    if (attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(row._id, {
        attempts,
        lastError: args.error,
        status: 'failed',
        leasedUntil: undefined,
        nextAttemptAt: undefined,
        updatedAt: now,
      })
      return
    }
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** attempts, BACKOFF_MAX_MS)
    await ctx.db.patch(row._id, {
      attempts,
      lastError: args.error,
      leasedUntil: undefined,
      nextAttemptAt: now + delay,
      updatedAt: now,
    })
    await scheduleKick(ctx, delay)
  },
})
