import type {
  AnyDataModel,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'

import type { ComponentApi } from './component/_generated/component.js'
import type {
  AskResult,
  ScrapeOptions,
  SiteGptConversation,
  SiteGptConversationListResponse,
  SiteGptCustomTextResponse,
  SiteGptDocumentListResponse,
  SiteGptFileUploadResponse,
  SiteGptIngestResponse,
  SiteGptKnowledgeDocument,
  SiteGptLead,
  SiteGptLeadListResponse,
  SiteGptMessageListResponse,
  SyncListResult,
  SyncState,
  SyncStateStatus,
} from './types.js'

export * from './types.js'

export type RunActionCtx = Pick<GenericActionCtx<AnyDataModel>, 'runAction'>
export type RunMutationCtx = Pick<GenericMutationCtx<AnyDataModel>, 'runMutation'>
export type RunQueryCtx = Pick<GenericQueryCtx<AnyDataModel>, 'runQuery'>

export type SiteGPTOptions = {
  /**
   * Chatbot to target when a call doesn't pass chatbotId. Handy when the app
   * embeds a single support bot.
   */
  defaultChatbotId?: string
}

type WithChatbot<T> = T & { chatbotId?: string }

type DocumentFilters = {
  query?: string
  sources?: string[]
  statuses?: string[]
  types?: string[]
}

type DocumentSelector = DocumentFilters & {
  documentIds?: string[]
  state?: 'all' | 'failed' | 'pending' | 'trained'
  all?: boolean
}

/**
 * Typed client for the SiteGPT Convex component.
 *
 * ```ts
 * import { components } from './_generated/api'
 * import { SiteGPT } from '@sitegpt/convex'
 *
 * const sitegpt = new SiteGPT(components.sitegpt, {
 *   defaultChatbotId: process.env.SITEGPT_CHATBOT_ID,
 * })
 * ```
 *
 * API-backed methods (ask, knowledge, conversations, leads, account) call the
 * SiteGPT REST API and must run in actions. Sync methods (syncDocument,
 * removeDocument, ...) run in mutations and commit atomically with your own
 * writes; a background worker pushes the changes to SiteGPT afterwards.
 */
export class SiteGPT {
  constructor(
    private readonly component: ComponentApi,
    private readonly options: SiteGPTOptions = {},
  ) {}

  private chatbot(chatbotId: string | undefined): string {
    const resolved = chatbotId ?? this.options.defaultChatbotId
    if (!resolved) {
      throw new Error(
        'SiteGPT: no chatbotId given and no defaultChatbotId configured on the client.',
      )
    }
    return resolved
  }

  // ── Chat ────────────────────────────────────────────────────────────────

  /**
   * Ask the chatbot a question and get the AI answer (generated
   * synchronously). Omit threadId to start a new conversation; pass the
   * returned threadId to continue it.
   */
  ask(
    ctx: RunActionCtx,
    args: WithChatbot<{ message: string; threadId?: string; pageUrl?: string }>,
  ): Promise<AskResult> {
    const { chatbotId, ...rest } = args
    return ctx.runAction(this.component.chat.ask, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<AskResult>
  }

  // ── Knowledge ───────────────────────────────────────────────────────────

  /** Add page URLs to the knowledge base. */
  addLinks(
    ctx: RunActionCtx,
    args: WithChatbot<{
      urls: string[]
      syncFrequency?: string
      skipExisting?: boolean
      scrapeOptions?: ScrapeOptions
    }>,
  ): Promise<SiteGptIngestResponse> {
    const { chatbotId, ...rest } = args
    return ctx.runAction(this.component.knowledge.addLinks, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<SiteGptIngestResponse>
  }

  /** Ingest every page listed in a sitemap. */
  addSitemap(
    ctx: RunActionCtx,
    args: WithChatbot<{
      url: string
      maxLinks?: number
      includePaths?: string[]
      excludePaths?: string[]
      syncFrequency?: string
      scanFrequency?: string
      skipExisting?: boolean
      scrapeOptions?: ScrapeOptions
    }>,
  ): Promise<SiteGptIngestResponse> {
    const { chatbotId, ...rest } = args
    return ctx.runAction(this.component.knowledge.addSitemap, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<SiteGptIngestResponse>
  }

  /** Crawl a website by following links from a starting URL. */
  crawlWebsite(
    ctx: RunActionCtx,
    args: WithChatbot<{
      url: string
      maxDepth?: number
      maxLinks?: number
      includePaths?: string[]
      excludePaths?: string[]
      allowedDomains?: string[]
      syncFrequency?: string
      skipExisting?: boolean
      scrapeOptions?: ScrapeOptions
    }>,
  ): Promise<SiteGptIngestResponse> {
    const { chatbotId, ...rest } = args
    return ctx.runAction(this.component.knowledge.crawlWebsite, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<SiteGptIngestResponse>
  }

  /** Ingest YouTube video transcripts. */
  addYoutube(
    ctx: RunActionCtx,
    args: WithChatbot<{ urls: string[]; syncFrequency?: string }>,
  ): Promise<SiteGptIngestResponse> {
    const { chatbotId, ...rest } = args
    return ctx.runAction(this.component.knowledge.addYoutube, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<SiteGptIngestResponse>
  }

  /**
   * Set the chatbot's single custom-text slot. This REPLACES the previous
   * custom text; for many independent documents use syncDocument instead.
   */
  setCustomText(
    ctx: RunActionCtx,
    args: WithChatbot<{ text: string; name?: string }>,
  ): Promise<SiteGptCustomTextResponse> {
    const { chatbotId, ...rest } = args
    return ctx.runAction(this.component.knowledge.setCustomText, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<SiteGptCustomTextResponse>
  }

  /** Upload files (base64-encoded) as knowledge documents, one per file. */
  uploadFiles(
    ctx: RunActionCtx,
    args: WithChatbot<{
      files: { name: string; type: string; base64: string }[]
    }>,
  ): Promise<SiteGptFileUploadResponse> {
    const { chatbotId, ...rest } = args
    return ctx.runAction(this.component.knowledge.uploadFiles, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<SiteGptFileUploadResponse>
  }

  /** List knowledge documents, cursor-paginated. */
  listDocuments(
    ctx: RunActionCtx,
    args?: WithChatbot<DocumentFilters & { limit?: number; cursor?: string }>,
  ): Promise<SiteGptDocumentListResponse> {
    const { chatbotId, ...rest } = args ?? {}
    return ctx.runAction(this.component.knowledge.listDocuments, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<SiteGptDocumentListResponse>
  }

  /** Fetch one knowledge document, optionally with inline text content. */
  getDocument(
    ctx: RunActionCtx,
    args: WithChatbot<{
      documentId: string
      includeContent?: boolean
      maxContentChars?: number
    }>,
  ): Promise<{
    document: SiteGptKnowledgeDocument
    ingestJob: Record<string, unknown> | null
    content: Record<string, unknown>
  }> {
    const { chatbotId, ...rest } = args
    return ctx.runAction(this.component.knowledge.getDocument, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<{
      document: SiteGptKnowledgeDocument
      ingestJob: Record<string, unknown> | null
      content: Record<string, unknown>
    }>
  }

  /** Replace a document's text content (re-embeds automatically). */
  updateDocumentContent(
    ctx: RunActionCtx,
    args: WithChatbot<{ documentId: string; content: string }>,
  ): Promise<{ document: { id: string; status: string } }> {
    const { chatbotId, ...rest } = args
    return ctx.runAction(this.component.knowledge.updateDocumentContent, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<{ document: { id: string; status: string } }>
  }

  /** Delete one knowledge document. */
  deleteDocument(
    ctx: RunActionCtx,
    args: WithChatbot<{ documentId: string }>,
  ): Promise<{ itemsDeleted: number }> {
    const { chatbotId, ...rest } = args
    return ctx.runAction(this.component.knowledge.deleteDocument, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<{ itemsDeleted: number }>
  }

  /** Bulk-delete documents by ids or filters. */
  deleteDocuments(
    ctx: RunActionCtx,
    args: WithChatbot<DocumentSelector>,
  ): Promise<{ itemsDeleted: number }> {
    const { chatbotId, ...rest } = args
    return ctx.runAction(this.component.knowledge.deleteDocuments, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<{ itemsDeleted: number }>
  }

  /** Queue a re-scrape/re-embed for documents selected by ids or filters. */
  resyncDocuments(
    ctx: RunActionCtx,
    args: WithChatbot<DocumentSelector>,
  ): Promise<{ itemsQueued: number; itemsSkipped: number }> {
    const { chatbotId, ...rest } = args
    return ctx.runAction(this.component.knowledge.resyncDocuments, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<{ itemsQueued: number; itemsSkipped: number }>
  }

  /** Aggregate knowledge stats: counts by source/status/type plus usage. */
  getDocumentStats(
    ctx: RunActionCtx,
    args?: WithChatbot<DocumentFilters>,
  ): Promise<Record<string, unknown>> {
    const { chatbotId, ...rest } = args ?? {}
    return ctx.runAction(this.component.knowledge.getDocumentStats, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<Record<string, unknown>>
  }

  // ── Conversations & leads ───────────────────────────────────────────────

  /** List conversations, cursor-paginated. */
  listConversations(
    ctx: RunActionCtx,
    args?: WithChatbot<{
      status?: string
      mode?: string
      escalated?: boolean
      important?: boolean
      read?: boolean
      leadId?: string
      tagIds?: string[]
      reaction?: string
      query?: string
      includeEmpty?: boolean
      limit?: number
      cursor?: string
    }>,
  ): Promise<SiteGptConversationListResponse> {
    const { chatbotId, ...rest } = args ?? {}
    return ctx.runAction(this.component.conversations.list, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<SiteGptConversationListResponse>
  }

  /** Fetch one conversation by thread id. */
  getConversation(
    ctx: RunActionCtx,
    args: WithChatbot<{ threadId: string }>,
  ): Promise<{ conversation: SiteGptConversation }> {
    const { chatbotId, ...rest } = args
    return ctx.runAction(this.component.conversations.get, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<{ conversation: SiteGptConversation }>
  }

  /** List a conversation's messages, cursor-paginated. */
  listMessages(
    ctx: RunActionCtx,
    args: WithChatbot<{ threadId: string; limit?: number; cursor?: string }>,
  ): Promise<SiteGptMessageListResponse> {
    const { chatbotId, ...rest } = args
    return ctx.runAction(this.component.conversations.listMessages, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<SiteGptMessageListResponse>
  }

  /** List leads captured by the chatbot, cursor-paginated. */
  listLeads(
    ctx: RunActionCtx,
    args?: WithChatbot<{
      query?: string
      important?: boolean
      archived?: boolean
      limit?: number
      cursor?: string
    }>,
  ): Promise<SiteGptLeadListResponse> {
    const { chatbotId, ...rest } = args ?? {}
    return ctx.runAction(this.component.leads.list, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<SiteGptLeadListResponse>
  }

  /** Fetch one lead by id. */
  getLead(
    ctx: RunActionCtx,
    args: WithChatbot<{ leadId: string }>,
  ): Promise<{ lead: SiteGptLead }> {
    const { chatbotId, ...rest } = args
    return ctx.runAction(this.component.leads.get, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<{ lead: SiteGptLead }>
  }

  // ── Account ─────────────────────────────────────────────────────────────

  /** The authenticated user and token metadata. Good for verifying setup. */
  me(ctx: RunActionCtx): Promise<Record<string, unknown>> {
    return ctx.runAction(this.component.account.me, {}) as Promise<
      Record<string, unknown>
    >
  }

  /** Current-window usage vs quotas for the account. */
  usage(ctx: RunActionCtx): Promise<Record<string, unknown>> {
    return ctx.runAction(this.component.account.usage, {}) as Promise<
      Record<string, unknown>
    >
  }

  /** Plan limits and per-chatbot assignments. */
  limits(ctx: RunActionCtx): Promise<Record<string, unknown>> {
    return ctx.runAction(this.component.account.limits, {}) as Promise<
      Record<string, unknown>
    >
  }

  /** List the account's chatbots. */
  listChatbots(ctx: RunActionCtx): Promise<Record<string, unknown>> {
    return ctx.runAction(this.component.account.listChatbots, {}) as Promise<
      Record<string, unknown>
    >
  }

  /** Fetch one chatbot. */
  getChatbot(
    ctx: RunActionCtx,
    args?: WithChatbot<Record<never, never>>,
  ): Promise<Record<string, unknown>> {
    return ctx.runAction(this.component.account.getChatbot, {
      chatbotId: this.chatbot(args?.chatbotId),
    }) as Promise<Record<string, unknown>>
  }

  // ── Transactional knowledge sync ────────────────────────────────────────

  /**
   * Keep one knowledge document in lockstep with your data. Call from the
   * same mutation that writes the source row: the sync intent commits
   * atomically with your write, and a background worker pushes it to SiteGPT.
   * Unchanged content is a no-op, so it is safe to call on every save.
   */
  syncDocument(
    ctx: RunMutationCtx,
    args: WithChatbot<{ key: string; name?: string; content: string }>,
  ): Promise<{ status: SyncStateStatus; changed: boolean }> {
    const { chatbotId, ...rest } = args
    return ctx.runMutation(this.component.sync.upsert, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<{ status: SyncStateStatus; changed: boolean }>
  }

  /**
   * Remove a synced document from the knowledge base. Call from the same
   * mutation that deletes the source row.
   */
  removeDocument(
    ctx: RunMutationCtx,
    args: WithChatbot<{ key: string }>,
  ): Promise<{ status: SyncStateStatus | null; changed: boolean }> {
    const { chatbotId, ...rest } = args
    return ctx.runMutation(this.component.sync.remove, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<{ status: SyncStateStatus | null; changed: boolean }>
  }

  /** Revive a terminally failed sync row and try again immediately. */
  retrySync(
    ctx: RunMutationCtx,
    args: WithChatbot<{ key: string }>,
  ): Promise<{ status: SyncStateStatus | null; changed: boolean }> {
    const { chatbotId, ...rest } = args
    return ctx.runMutation(this.component.sync.retry, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<{ status: SyncStateStatus | null; changed: boolean }>
  }

  /** Sync state for one key (subscribable from a query), or null. */
  getSyncState(
    ctx: RunQueryCtx,
    args: WithChatbot<{ key: string }>,
  ): Promise<SyncState | null> {
    const { chatbotId, ...rest } = args
    return ctx.runQuery(this.component.sync.get, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<SyncState | null>
  }

  /** Page through sync states for a chatbot, ordered by key. */
  listSyncStates(
    ctx: RunQueryCtx,
    args?: WithChatbot<{ cursor?: string; limit?: number }>,
  ): Promise<SyncListResult> {
    const { chatbotId, ...rest } = args ?? {}
    return ctx.runQuery(this.component.sync.list, {
      ...rest,
      chatbotId: this.chatbot(chatbotId),
    }) as Promise<SyncListResult>
  }
}

export type { ComponentApi } from './component/_generated/component.js'
