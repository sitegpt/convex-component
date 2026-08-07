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

async function drain(t: ReturnType<typeof newT>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers)
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

  it('rejects oversized content at the front door', async () => {
    const t = newT()
    stubFetch(() => okEnvelope({}))
    await expect(
      t.mutation(api.sync.upsert, {
        chatbotId: BOT,
        key: 'k',
        content: 'x'.repeat(900_001),
      }),
    ).rejects.toThrow('limited to 900000 characters')
  })

  it('kick claims nothing when no rows are due', async () => {
    const t = newT()
    stubFetch(() => okEnvelope({}))
    const result = await t.mutation(internal.sync.kick, {})
    expect(result).toEqual({ claimed: 0 })
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
