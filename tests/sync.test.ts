import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../src/component/_generated/api.js'
import schema from '../src/component/schema.js'

const modules = import.meta.glob('../src/component/**/*.ts')

const BOT = 'bot_test'

type FetchCall = { method: string; url: string; body: unknown }

function envelope(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function okEnvelope(data: unknown): Response {
  return envelope(200, { ok: true, data })
}

function errorEnvelope(status: number, code: string, message = code): Response {
  return envelope(status, { ok: false, error: { code, message } })
}

/**
 * Fetch stub with a scripted responder. Records every call so assertions can
 * check method, path and body.
 */
function stubFetch(respond: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call: FetchCall = {
        method: init?.method ?? 'GET',
        url: String(input),
        body:
          typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      }
      calls.push(call)
      return respond(call)
    }),
  )
  return calls
}

function newT() {
  return convexTest(schema, modules)
}

/**
 * Drain scheduled work by stepping simulated time in 1s increments.
 * Deliberately NOT finishAllScheduledFunctions(vi.runAllTimers): that warps
 * time a whole lease window per pump, expiring every claim before its +0
 * push action even starts, which both livelocks the engine under test and
 * hides real-world liveness characteristics from assertions.
 */
async function drain(t: ReturnType<typeof newT>, seconds = 4000) {
  for (let i = 0; i < seconds; i++) {
    vi.advanceTimersByTime(1_000)
    await t.finishInProgressScheduledFunctions()
  }
}

describe('transactional knowledge sync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    process.env.SITEGPT_API_TOKEN = 'test-token'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    delete process.env.SITEGPT_API_TOKEN
    delete process.env.SITEGPT_API_BASE
  })

  it('creates a document on first sync and records the document id', async () => {
    const t = newT()
    const calls = stubFetch(() =>
      okEnvelope({ documents: [{ id: 'doc_1', status: 'QUEUED', error: null }] }),
    )

    const result = await t.mutation(api.sync.upsert, {
      chatbotId: BOT,
      key: 'faq/refunds',
      name: 'Refund policy',
      content: 'We refund within 30 days.',
    })
    expect(result).toEqual({ status: 'pending', changed: true })

    await drain(t)

    expect(calls).toHaveLength(1)
    expect(calls[0]!.method).toBe('POST')
    expect(calls[0]!.url).toContain(`/api/v2/chatbots/${BOT}/knowledge/files`)
    const body = calls[0]!.body as {
      files: { name: string; type: string; base64: string }[]
    }
    expect(body.files).toHaveLength(1)
    expect(body.files[0]!.name).toBe('Refund policy.md')
    expect(body.files[0]!.type).toBe('text/markdown')

    const state = await t.query(api.sync.get, { chatbotId: BOT, key: 'faq/refunds' })
    expect(state).toMatchObject({
      status: 'synced',
      documentId: 'doc_1',
      attempts: 0,
      lastError: null,
      hasPendingContent: false,
    })
  })

  it('is a no-op when content is unchanged', async () => {
    const t = newT()
    const calls = stubFetch(() =>
      okEnvelope({ documents: [{ id: 'doc_1', status: 'QUEUED', error: null }] }),
    )
    const args = { chatbotId: BOT, key: 'k', content: 'same content' }
    await t.mutation(api.sync.upsert, args)
    await drain(t)
    expect(calls).toHaveLength(1)

    const second = await t.mutation(api.sync.upsert, args)
    expect(second).toEqual({ status: 'synced', changed: false })
    await drain(t)
    expect(calls).toHaveLength(1)
  })

  it('updates in place via PATCH once a document id exists', async () => {
    const t = newT()
    const calls = stubFetch((call) =>
      call.method === 'PATCH'
        ? okEnvelope({ document: { id: 'doc_1', status: 'QUEUED' } })
        : okEnvelope({ documents: [{ id: 'doc_1', status: 'QUEUED', error: null }] }),
    )
    await t.mutation(api.sync.upsert, { chatbotId: BOT, key: 'k', content: 'v1' })
    await drain(t)
    await t.mutation(api.sync.upsert, { chatbotId: BOT, key: 'k', content: 'v2' })
    await drain(t)

    expect(calls).toHaveLength(2)
    expect(calls[1]!.method).toBe('PATCH')
    expect(calls[1]!.url).toContain('/documents/doc_1')
    expect(calls[1]!.body).toEqual({ content: 'v2' })

    const state = await t.query(api.sync.get, { chatbotId: BOT, key: 'k' })
    expect(state).toMatchObject({ status: 'synced', documentId: 'doc_1' })
  })

  it('recreates the document when PATCH hits a 404', async () => {
    const t = newT()
    let created = 0
    const calls = stubFetch((call) => {
      if (call.method === 'PATCH') {
        return errorEnvelope(404, 'DOCUMENT_NOT_FOUND')
      }
      created += 1
      return okEnvelope({
        documents: [{ id: `doc_${created}`, status: 'QUEUED', error: null }],
      })
    })
    await t.mutation(api.sync.upsert, { chatbotId: BOT, key: 'k', content: 'v1' })
    await drain(t)
    await t.mutation(api.sync.upsert, { chatbotId: BOT, key: 'k', content: 'v2' })
    await drain(t)

    expect(calls.map((c) => c.method)).toEqual(['POST', 'PATCH', 'POST'])
    const state = await t.query(api.sync.get, { chatbotId: BOT, key: 'k' })
    expect(state).toMatchObject({ status: 'synced', documentId: 'doc_2' })
  })

  it('removes an unpushed row without any API call', async () => {
    const t = newT()
    const calls = stubFetch(() => okEnvelope({}))
    await t.mutation(api.sync.upsert, { chatbotId: BOT, key: 'k', content: 'v1' })
    const removal = await t.mutation(api.sync.remove, { chatbotId: BOT, key: 'k' })
    expect(removal).toEqual({ status: null, changed: true })
    await drain(t)
    expect(calls).toHaveLength(0)
    const state = await t.query(api.sync.get, { chatbotId: BOT, key: 'k' })
    expect(state).toBeNull()
  })

  it('deletes the remote document on remove, tolerating 404', async () => {
    const t = newT()
    const calls = stubFetch((call) => {
      if (call.method === 'DELETE') {
        return errorEnvelope(404, 'DOCUMENT_NOT_FOUND')
      }
      return okEnvelope({ documents: [{ id: 'doc_1', status: 'QUEUED', error: null }] })
    })
    await t.mutation(api.sync.upsert, { chatbotId: BOT, key: 'k', content: 'v1' })
    await drain(t)
    await t.mutation(api.sync.remove, { chatbotId: BOT, key: 'k' })
    await drain(t)

    expect(calls.map((c) => c.method)).toEqual(['POST', 'DELETE'])
    expect(calls[1]!.url).toContain('/documents/doc_1')
    expect(calls[1]!.url).toContain('confirm=true')
    const state = await t.query(api.sync.get, { chatbotId: BOT, key: 'k' })
    expect(state).toBeNull()
  })

  it('backs off on failure and lands on failed after MAX_ATTEMPTS', async () => {
    const t = newT()
    const calls = stubFetch(() => errorEnvelope(500, 'SERVER_ERROR'))
    await t.mutation(api.sync.upsert, { chatbotId: BOT, key: 'k', content: 'v1' })
    await drain(t)

    const state = await t.query(api.sync.get, { chatbotId: BOT, key: 'k' })
    expect(state).toMatchObject({ status: 'failed', attempts: 8 })
    expect(state!.lastError).toContain('SERVER_ERROR')
    expect(calls.length).toBe(8)
  })

  it('retrySync revives a failed row and succeeds', async () => {
    const t = newT()
    let failing = true
    const calls = stubFetch(() =>
      failing
        ? errorEnvelope(500, 'SERVER_ERROR')
        : okEnvelope({ documents: [{ id: 'doc_9', status: 'QUEUED', error: null }] }),
    )
    await t.mutation(api.sync.upsert, { chatbotId: BOT, key: 'k', content: 'v1' })
    await drain(t)
    expect(
      (await t.query(api.sync.get, { chatbotId: BOT, key: 'k' }))!.status,
    ).toBe('failed')

    failing = false
    const retried = await t.mutation(api.sync.retry, { chatbotId: BOT, key: 'k' })
    expect(retried).toEqual({ status: 'pending', changed: true })
    await drain(t)
    const state = await t.query(api.sync.get, { chatbotId: BOT, key: 'k' })
    expect(state).toMatchObject({ status: 'synced', documentId: 'doc_9' })
    expect(calls.length).toBeGreaterThan(8)
  })

  it('pages sync states by key', async () => {
    const t = newT()
    stubFetch(() =>
      okEnvelope({ documents: [{ id: 'doc_x', status: 'QUEUED', error: null }] }),
    )
    for (const key of ['a', 'b', 'c', 'd', 'e']) {
      await t.mutation(api.sync.upsert, {
        chatbotId: BOT,
        key,
        content: `content ${key}`,
      })
    }
    await drain(t)

    const page1 = await t.query(api.sync.list, { chatbotId: BOT, limit: 2 })
    expect(page1.states.map((s) => s.key)).toEqual(['a', 'b'])
    expect(page1.hasNextPage).toBe(true)
    const page2 = await t.query(api.sync.list, {
      chatbotId: BOT,
      limit: 2,
      cursor: page1.nextCursor!,
    })
    expect(page2.states.map((s) => s.key)).toEqual(['c', 'd'])
    const page3 = await t.query(api.sync.list, {
      chatbotId: BOT,
      limit: 2,
      cursor: page2.nextCursor!,
    })
    expect(page3.states.map((s) => s.key)).toEqual(['e'])
    expect(page3.hasNextPage).toBe(false)
    expect(page3.nextCursor).toBeNull()
  })

  it('rejects oversized content at the front door, measured in bytes', async () => {
    const t = newT()
    stubFetch(() => okEnvelope({}))
    await expect(
      t.mutation(api.sync.upsert, {
        chatbotId: BOT,
        key: 'k',
        content: 'x'.repeat(900_001),
      }),
    ).rejects.toThrow('limited to 900000 bytes')
    // 400k CJK characters fit in UTF-16 length but exceed the byte budget;
    // catching this here keeps the component's own insert from blowing
    // Convex's byte-based document limit and rolling back the host mutation.
    await expect(
      t.mutation(api.sync.upsert, {
        chatbotId: BOT,
        key: 'k',
        content: '世'.repeat(400_000),
      }),
    ).rejects.toThrow('limited to 900000 bytes')
  })

  it('kick claims nothing when no rows are due', async () => {
    const t = newT()
    stubFetch(() => okEnvelope({}))
    const result = await t.mutation(internal.sync.kick, {})
    expect(result).toEqual({ claimed: 0 })
  })

  it('kick schedules a retry when leased-due rows fill the scan window, and stays quiet otherwise', async () => {
    const t = newT()
    stubFetch(() => okEnvelope({}))
    const now = Date.now()
    await t.run(async (ctx) => {
      // 12 rows that look claimed (live lease) but were reset back into the
      // due range by a mid-flight upsert: they occlude the whole
      // take(BATCH + 1) window.
      for (let i = 0; i < 12; i++) {
        await ctx.db.insert('syncedDocuments', {
          chatbotId: BOT,
          key: `occluder/${String(i).padStart(2, '0')}`,
          status: 'pending',
          contentHash: 'h',
          content: 'v2',
          attempts: 0,
          updatedAt: now,
          nextAttemptAt: now,
          leasedUntil: now + 10 * 60_000,
        })
      }
    })
    const scheduledKicks = async () =>
      t.run(async (ctx) => {
        const jobs = await ctx.db.system.query('_scheduled_functions').collect()
        return jobs.filter(
          (j) => j.name.includes('kick') && j.state.kind === 'pending',
        ).length
      })

    const before = await scheduledKicks()
    const result = await t.mutation(internal.sync.kick, {})
    expect(result).toEqual({ claimed: 0 })
    // The backstop must re-arm so unleased rows hidden behind the occluders
    // are claimed in seconds, not at the 15-minute watchdog.
    expect(await scheduledKicks()).toBe(before + 1)

    // But with nothing due at all, claimed-0 must NOT re-arm (no idle churn).
    const t2 = newT()
    const before2 = await t2.run(async (ctx) => {
      const jobs = await ctx.db.system.query('_scheduled_functions').collect()
      return jobs.length
    })
    await t2.mutation(internal.sync.kick, {})
    const after2 = await t2.run(async (ctx) => {
      const jobs = await ctx.db.system.query('_scheduled_functions').collect()
      return jobs.length
    })
    expect(after2).toBe(before2)
  })

  it('re-arms after a partial claim when leased rows occupied the scan window', async () => {
    const t = newT()
    stubFetch(() => okEnvelope({}))
    const now = Date.now()
    await t.run(async (ctx) => {
      // Five leased-but-due occluders sorted at the front of the window...
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert('syncedDocuments', {
          chatbotId: BOT,
          key: `occluder/${i}`,
          status: 'pending',
          contentHash: 'h',
          content: 'v2',
          attempts: 0,
          updatedAt: now,
          nextAttemptAt: now - 1_000,
          leasedUntil: now + 10 * 60_000,
        })
      }
      // ...and three unleased due rows behind them. The window (BATCH + 1)
      // still has room, so kick claims these three: a partial claim.
      for (let i = 0; i < 3; i++) {
        await ctx.db.insert('syncedDocuments', {
          chatbotId: BOT,
          key: `due/${i}`,
          status: 'pending',
          contentHash: 'h',
          content: 'v1',
          attempts: 0,
          updatedAt: now,
          nextAttemptAt: now - 500,
        })
      }
    })
    const scheduledKicks = async () =>
      t.run(async (ctx) => {
        const jobs = await ctx.db.system.query('_scheduled_functions').collect()
        return jobs.filter(
          (j) => j.name.includes('kick') && j.state.kind === 'pending',
        ).length
      })
    const result = await t.mutation(internal.sync.kick, {})
    expect(result).toEqual({ claimed: 3 })
    // Two pending kicks: the lease watchdog plus the short re-arm that
    // covers unleased rows possibly hidden behind the skipped leases.
    expect(await scheduledKicks()).toBe(2)
  })

  it('re-kicks from the happy path when the row was reset mid-flight', async () => {
    const t = newT()
    stubFetch(() => okEnvelope({}))
    const now = Date.now()
    const claim = now + 15 * 60_000
    // A claimed row whose nextAttemptAt was reset by a mid-flight upsert,
    // where the worker read the row AFTER the reset: markSynced resolves via
    // the happy path (hash matches) and must still re-kick.
    const rowId = await t.run(async (ctx) =>
      ctx.db.insert('syncedDocuments', {
        chatbotId: BOT,
        key: 'k',
        status: 'pending',
        contentHash: 'h2',
        content: 'v2',
        attempts: 0,
        updatedAt: now,
        nextAttemptAt: now,
        leasedUntil: claim,
      }),
    )
    const scheduledKicks = async () =>
      t.run(async (ctx) => {
        const jobs = await ctx.db.system.query('_scheduled_functions').collect()
        return jobs.filter(
          (j) => j.name.includes('kick') && j.state.kind === 'pending',
        ).length
      })
    const before = await scheduledKicks()
    await t.mutation(internal.sync.markSynced, {
      id: rowId,
      claim,
      documentId: 'doc_1',
      pushedHash: 'h2',
    })
    expect(await scheduledKicks()).toBe(before + 1)
    const state = await t.query(api.sync.get, { chatbotId: BOT, key: 'k' })
    expect(state).toMatchObject({ status: 'synced', documentId: 'doc_1' })

    // An untouched claimed row (nextAttemptAt === leasedUntil) must NOT
    // trigger the signal.
    const rowId2 = await t.run(async (ctx) =>
      ctx.db.insert('syncedDocuments', {
        chatbotId: BOT,
        key: 'k2',
        status: 'pending',
        contentHash: 'h1',
        content: 'v1',
        attempts: 0,
        updatedAt: now,
        nextAttemptAt: claim,
        leasedUntil: claim,
      }),
    )
    const before2 = await scheduledKicks()
    await t.mutation(internal.sync.markSynced, {
      id: rowId2,
      claim,
      documentId: 'doc_2',
      pushedHash: 'h1',
    })
    expect(await scheduledKicks()).toBe(before2)
  })

  it('converges when content changes while the create is in flight', async () => {
    const t = newT()
    let midFlightDone = false
    const calls = stubFetch(async (call) => {
      if (call.method === 'POST' && !midFlightDone) {
        midFlightDone = true
        // The user edits the article while the first push is on the wire.
        await t.mutation(api.sync.upsert, { chatbotId: BOT, key: 'k', content: 'v2' })
        return okEnvelope({
          documents: [{ id: 'doc_1', status: 'QUEUED', error: null }],
        })
      }
      return okEnvelope({ document: { id: 'doc_1', status: 'QUEUED' } })
    })
    await t.mutation(api.sync.upsert, { chatbotId: BOT, key: 'k', content: 'v1' })
    await drain(t)

    // First push created with v1; markSynced saw the newer hash and
    // re-queued, so a second push PATCHed v2 onto the same document.
    expect(calls.map((c) => c.method)).toEqual(['POST', 'PATCH'])
    expect(calls[1]!.body).toEqual({ content: 'v2' })
    const state = await t.query(api.sync.get, { chatbotId: BOT, key: 'k' })
    expect(state).toMatchObject({ status: 'synced', documentId: 'doc_1' })
  })

  it('deletes the document created by an in-flight push when remove lands mid-create', async () => {
    const t = newT()
    let removed = false
    const calls = stubFetch(async (call) => {
      if (call.method === 'POST' && !removed) {
        removed = true
        await t.mutation(api.sync.remove, { chatbotId: BOT, key: 'k' })
        return okEnvelope({
          documents: [{ id: 'doc_1', status: 'QUEUED', error: null }],
        })
      }
      return okEnvelope({})
    })
    await t.mutation(api.sync.upsert, { chatbotId: BOT, key: 'k', content: 'v1' })
    await drain(t)

    expect(calls.map((c) => c.method)).toEqual(['POST', 'DELETE'])
    expect(calls[1]!.url).toContain('/documents/doc_1')
    const state = await t.query(api.sync.get, { chatbotId: BOT, key: 'k' })
    expect(state).toBeNull()
  })

  it('recreates the document when an upsert lands while the delete is in flight', async () => {
    const t = newT()
    let created = 0
    let reupserted = false
    const calls = stubFetch(async (call) => {
      if (call.method === 'DELETE' && !reupserted) {
        reupserted = true
        await t.mutation(api.sync.upsert, { chatbotId: BOT, key: 'k', content: 'v2' })
        return okEnvelope({})
      }
      if (call.method === 'POST') {
        created += 1
        return okEnvelope({
          documents: [{ id: `doc_${created}`, status: 'QUEUED', error: null }],
        })
      }
      return okEnvelope({})
    })
    await t.mutation(api.sync.upsert, { chatbotId: BOT, key: 'k', content: 'v1' })
    await drain(t)
    await t.mutation(api.sync.remove, { chatbotId: BOT, key: 'k' })
    await drain(t)

    // doc_1 created, deleted, then the re-upsert created doc_2 fresh
    // (markDeleted cleared the stale id because it matched the deleted one).
    expect(calls.map((c) => c.method)).toEqual(['POST', 'DELETE', 'POST'])
    const state = await t.query(api.sync.get, { chatbotId: BOT, key: 'k' })
    expect(state).toMatchObject({ status: 'synced', documentId: 'doc_2' })
  })

  it('ignores outcome reports carrying a stale claim', async () => {
    const t = newT()
    stubFetch(() =>
      okEnvelope({ documents: [{ id: 'doc_1', status: 'QUEUED', error: null }] }),
    )
    await t.mutation(api.sync.upsert, { chatbotId: BOT, key: 'k', content: 'v1' })
    await drain(t)

    const rowId = await t.run(async (ctx) => {
      const row = await ctx.db.query('syncedDocuments').first()
      return row!._id
    })
    // A worker whose lease expired reports a different document id; the
    // claim check must drop it.
    await t.mutation(internal.sync.markSynced, {
      id: rowId,
      claim: 12345,
      documentId: 'doc_stale',
      pushedHash: 'whatever',
    })
    const state = await t.query(api.sync.get, { chatbotId: BOT, key: 'k' })
    expect(state).toMatchObject({ status: 'synced', documentId: 'doc_1' })
  })

  it('treats an upload rejected per-document as a failure even when an id is returned', async () => {
    const t = newT()
    stubFetch(() =>
      okEnvelope({
        documents: [{ id: 'doc_1', status: 'FAILED', error: 'quota exceeded' }],
      }),
    )
    await t.mutation(api.sync.upsert, { chatbotId: BOT, key: 'k', content: 'v1' })
    await drain(t)
    const state = await t.query(api.sync.get, { chatbotId: BOT, key: 'k' })
    expect(state).toMatchObject({ status: 'failed' })
    expect(state!.lastError).toContain('quota exceeded')
  })

  it('drains a 25-row bulk import in seconds, not lease windows', async () => {
    const t = newT()
    let created = 0
    const calls = stubFetch(() => {
      created += 1
      return okEnvelope({
        documents: [{ id: `doc_${created}`, status: 'QUEUED', error: null }],
      })
    })
    const keys = Array.from({ length: 25 }, (_, i) =>
      `bulk/${String(i).padStart(2, '0')}`,
    )
    for (const key of keys) {
      await t.mutation(api.sync.upsert, {
        chatbotId: BOT,
        key,
        content: `content of ${key}`,
      })
    }

    // Deliberately NOT drain(): runAllTimers would fast-forward through
    // multi-minute stalls and hide liveness bugs. Simulate ~30s of wall
    // clock; claimed batches must chain without waiting on lease expiry.
    for (let second = 0; second < 30; second++) {
      vi.advanceTimersByTime(1_000)
      await t.finishInProgressScheduledFunctions()
    }

    expect(calls).toHaveLength(25)
    const page = await t.query(api.sync.list, { chatbotId: BOT, limit: 100 })
    expect(page.states).toHaveLength(25)
    expect(page.states.every((s) => s.status === 'synced')).toBe(true)
  })
})

describe('chat.ask', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    process.env.SITEGPT_API_TOKEN = 'test-token'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    delete process.env.SITEGPT_API_TOKEN
  })

  it('starts a new conversation and normalizes the answer', async () => {
    const t = newT()
    const calls = stubFetch(() =>
      okEnvelope({
        conversation: { threadId: 'thread_1' },
        message: {
          messageId: 'msg_1',
          answer: { text: 'You can refund within 30 days.', timestamp: 'now' },
        },
      }),
    )
    const result = (await t.action(api.chat.ask, {
      chatbotId: BOT,
      message: 'What is the refund policy?',
    })) as { threadId: string; answer: string | null }

    expect(calls[0]!.method).toBe('POST')
    expect(calls[0]!.url).toContain(`/api/v2/chatbots/${BOT}/messages`)
    expect(result.threadId).toBe('thread_1')
    expect(result.answer).toBe('You can refund within 30 days.')
  })

  it('continues an existing thread when threadId is passed', async () => {
    const t = newT()
    const calls = stubFetch(() =>
      okEnvelope({
        message: { messageId: 'msg_2', answer: { text: 'Yes.', timestamp: 'now' } },
      }),
    )
    const result = (await t.action(api.chat.ask, {
      chatbotId: BOT,
      threadId: 'thread_1',
      message: 'Even for annual plans?',
    })) as { threadId: string; answer: string | null }

    expect(calls[0]!.url).toContain('/conversations/thread_1/messages')
    expect(result.threadId).toBe('thread_1')
    expect(result.answer).toBe('Yes.')
  })

  it('surfaces API errors with code and status', async () => {
    const t = newT()
    stubFetch(() => errorEnvelope(401, 'UNAUTHORIZED', 'Invalid token'))
    await expect(
      t.action(api.chat.ask, { chatbotId: BOT, message: 'hi' }),
    ).rejects.toThrow('Invalid token')
  })
})
