import { describe, expect, it } from 'vitest'

import type { ComponentApi } from '../src/component/_generated/component.js'
import {
  SiteGPT,
  type RunActionCtx,
  type RunMutationCtx,
  type RunQueryCtx,
} from '../src/index.js'

type Call = { ref: unknown; args: unknown }

function ref(name: string): unknown {
  return { name }
}

const component = {
  account: {
    me: ref('account.me'),
    usage: ref('account.usage'),
    limits: ref('account.limits'),
    listChatbots: ref('account.listChatbots'),
    getChatbot: ref('account.getChatbot'),
  },
  chat: { ask: ref('chat.ask') },
  conversations: {
    list: ref('conversations.list'),
    get: ref('conversations.get'),
    listMessages: ref('conversations.listMessages'),
  },
  knowledge: {
    addLinks: ref('knowledge.addLinks'),
    addSitemap: ref('knowledge.addSitemap'),
    crawlWebsite: ref('knowledge.crawlWebsite'),
    addYoutube: ref('knowledge.addYoutube'),
    setCustomText: ref('knowledge.setCustomText'),
    uploadFiles: ref('knowledge.uploadFiles'),
    listDocuments: ref('knowledge.listDocuments'),
    getDocument: ref('knowledge.getDocument'),
    updateDocumentContent: ref('knowledge.updateDocumentContent'),
    deleteDocument: ref('knowledge.deleteDocument'),
    deleteDocuments: ref('knowledge.deleteDocuments'),
    resyncDocuments: ref('knowledge.resyncDocuments'),
    getDocumentStats: ref('knowledge.getDocumentStats'),
  },
  leads: { list: ref('leads.list'), get: ref('leads.get') },
  sync: {
    upsert: ref('sync.upsert'),
    remove: ref('sync.remove'),
    retry: ref('sync.retry'),
    get: ref('sync.get'),
    list: ref('sync.list'),
  },
} as unknown as ComponentApi

function actionCtx(calls: Call[], result: unknown = {}): RunActionCtx {
  return {
    runAction: (async (r: unknown, args: unknown) => {
      calls.push({ ref: r, args })
      return result
    }) as RunActionCtx['runAction'],
  }
}

function mutationCtx(calls: Call[], result: unknown = {}): RunMutationCtx {
  return {
    runMutation: (async (r: unknown, args: unknown) => {
      calls.push({ ref: r, args })
      return result
    }) as RunMutationCtx['runMutation'],
  }
}

function queryCtx(calls: Call[], result: unknown = null): RunQueryCtx {
  return {
    runQuery: (async (r: unknown, args: unknown) => {
      calls.push({ ref: r, args })
      return result
    }) as RunQueryCtx['runQuery'],
  }
}

describe('SiteGPT client', () => {
  it('delegates ask to chat.ask with an explicit chatbotId', async () => {
    const calls: Call[] = []
    const client = new SiteGPT(component)
    await client.ask(actionCtx(calls), {
      chatbotId: 'bot_1',
      message: 'How do refunds work?',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.ref).toBe(component.chat.ask)
    expect(calls[0]!.args).toEqual({
      chatbotId: 'bot_1',
      message: 'How do refunds work?',
    })
  })

  it('fills in defaultChatbotId when none is passed', async () => {
    const calls: Call[] = []
    const client = new SiteGPT(component, { defaultChatbotId: 'bot_default' })
    await client.listDocuments(actionCtx(calls))
    expect(calls[0]!.args).toMatchObject({ chatbotId: 'bot_default' })
  })

  it('throws a clear error when no chatbotId is available', () => {
    const client = new SiteGPT(component)
    expect(() =>
      client.syncDocument(mutationCtx([]), { key: 'a', content: 'b' }),
    ).toThrow('no chatbotId')
  })

  it('routes sync helpers to component mutations and queries', async () => {
    const calls: Call[] = []
    const client = new SiteGPT(component, { defaultChatbotId: 'bot_1' })
    await client.syncDocument(mutationCtx(calls), {
      key: 'faq/refunds',
      name: 'Refund policy',
      content: '30-day refunds, no questions asked.',
    })
    await client.removeDocument(mutationCtx(calls), { key: 'faq/refunds' })
    await client.getSyncState(queryCtx(calls), { key: 'faq/refunds' })
    expect(calls.map((c) => c.ref)).toEqual([
      component.sync.upsert,
      component.sync.remove,
      component.sync.get,
    ])
    expect(calls[0]!.args).toEqual({
      chatbotId: 'bot_1',
      key: 'faq/refunds',
      name: 'Refund policy',
      content: '30-day refunds, no questions asked.',
    })
  })

  it('does not leak the chatbotId option into account calls', async () => {
    const calls: Call[] = []
    const client = new SiteGPT(component, { defaultChatbotId: 'bot_1' })
    await client.me(actionCtx(calls))
    expect(calls[0]!.ref).toBe(component.account.me)
    expect(calls[0]!.args).toEqual({})
  })
})
