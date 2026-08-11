/**
 * Public wire types for the SiteGPT agent API (v2), trimmed to the surface
 * this component wraps. Timestamps are ISO 8601 strings.
 */

export type SiteGptChatMode = 'AGENT' | 'AI'

export type SiteGptMessageReaction = 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE'

export type SiteGptMessageType =
  | 'AGENT_MESSAGE'
  | 'NORMAL_MESSAGE'
  | 'SYSTEM_MESSAGE'
  | 'USER_MESSAGE'

export type SiteGptConversationMessage = {
  messageId: string
  reaction: SiteGptMessageReaction
  gptModel: string | null
  sources: string[]
  agentId: string | null
  agentName: string | null
  iconUrl: string | null
  pageUrl?: string | null
  createdAt: string
  updatedAt: string
  messageType: SiteGptMessageType
  systemMessageType: string | null
  question?: { text: string; timestamp: string } | null
  answer?: { text: string; timestamp: string } | null
  [key: string]: unknown
}

export type SiteGptChatUser = {
  id: string
  name: string
  email: string
  phone: string
  verified: boolean
  createdAt: string
  updatedAt: string
}

export type SiteGptLead = {
  id: string
  chatbotId: string
  email: string
  name: string
  phone: string
  tags: string[]
  chatUser: SiteGptChatUser
  customData?: Record<string, unknown>
  important: boolean
  archived: boolean
  createdAt: string
  updatedAt: string
}

export type SiteGptConversation = {
  threadId: string
  chatbotId: string
  mode: SiteGptChatMode
  startedAt: string
  updatedAt: string
  endedAt: string | null
  escalated: boolean
  important: boolean
  resolved: boolean
  title: string | null
  tagIds: string[]
  sessionId: string | null
  pageUrl: string | null
  chatUserId: string | null
  chatUser: SiteGptChatUser | null
  lead: SiteGptLead | null
  totalMessages: number
  unreadMessages: number
  lastMessage: SiteGptConversationMessage | null
  messages?: SiteGptConversationMessage[]
  [key: string]: unknown
}

export type SiteGptKnowledgeDocument = {
  id: string
  name: string | null
  externalId: string
  type: string
  source: string
  status: string
  error: string | null
  metadata: Record<string, string | string[]>
  properties: {
    mimeType?: string
    fileSize?: number
    characterCount?: number
    tokenCount?: number
    embeddingCount?: number
  } | null
  isContentUpdatedManually: boolean
  lastSyncedAt: string | null
  createdAt: string | null
  updatedAt: string | null
  [key: string]: unknown
}

export type SiteGptPagination = {
  limit: number
  hasNextPage: boolean
  nextCursor: string | null
}

export type SiteGptIngestDocument = {
  id: string
  status: string
  error: string | null
}

export type SiteGptIngestResponse = {
  ingestJobRunId: string
  documents: SiteGptIngestDocument[]
  source: string
  requested: Record<string, unknown>
  effective: Record<string, unknown>
}

export type SiteGptFileUploadResponse = {
  ingestJobRunIds: string[]
  documents: SiteGptIngestDocument[]
  source: string
  requested: { filesCount: number; fileNames: string[] }
  effective: Record<string, unknown>
}

export type SiteGptCustomTextResponse = {
  document: { id: string; source: string }
  replacedDocumentId: string | null
}

export type SiteGptDocumentListResponse = {
  documents: SiteGptKnowledgeDocument[]
  pagination: SiteGptPagination
}

export type SiteGptConversationListResponse = {
  conversations: SiteGptConversation[]
  filters: Record<string, unknown>
  pagination: SiteGptPagination
}

export type SiteGptMessageListResponse = {
  messages: SiteGptConversationMessage[]
  pagination: SiteGptPagination
}

export type SiteGptLeadListResponse = {
  leads: SiteGptLead[]
  pagination: SiteGptPagination
}

/** Normalized result of SiteGPT.ask(). */
export type AskResult = {
  threadId: string
  /** The AI's reply text, or null if the chatbot did not produce one. */
  answer: string | null
  message: SiteGptConversationMessage
  /** Populated when the call started a new conversation. */
  conversation: SiteGptConversation | null
}

export type SyncStateStatus = 'deleting' | 'failed' | 'pending' | 'synced'

/** Public view of one synced document's outbox row. */
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

export type SyncListResult = {
  states: SyncState[]
  hasNextPage: boolean
  nextCursor: string | null
}

export type ScrapeOptions = {
  onlyMainContent?: boolean
  includeSelectors?: string[]
  excludeSelectors?: string[]
  headers?: Record<string, string>
}
