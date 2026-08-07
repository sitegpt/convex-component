import { v } from 'convex/values'

import { action } from './_generated/server.js'
import { chatbotPath, sitegptRequest } from './lib/http.js'

const scrapeOptions = v.object({
  onlyMainContent: v.optional(v.boolean()),
  includeSelectors: v.optional(v.array(v.string())),
  excludeSelectors: v.optional(v.array(v.string())),
  headers: v.optional(v.record(v.string(), v.string())),
})

const documentFilters = {
  query: v.optional(v.string()),
  sources: v.optional(v.array(v.string())),
  statuses: v.optional(v.array(v.string())),
  types: v.optional(v.array(v.string())),
}

/** Add individual page URLs to the chatbot's knowledge base. */
export const addLinks = action({
  args: {
    chatbotId: v.string(),
    urls: v.array(v.string()),
    syncFrequency: v.optional(v.string()),
    skipExisting: v.optional(v.boolean()),
    scrapeOptions: v.optional(scrapeOptions),
  },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, { chatbotId, ...body }) =>
    sitegptRequest({
      method: 'POST',
      path: chatbotPath(chatbotId, '/knowledge/links'),
      body,
    }),
})

/** Ingest a sitemap: every page it lists becomes a knowledge document. */
export const addSitemap = action({
  args: {
    chatbotId: v.string(),
    url: v.string(),
    maxLinks: v.optional(v.float64()),
    includePaths: v.optional(v.array(v.string())),
    excludePaths: v.optional(v.array(v.string())),
    syncFrequency: v.optional(v.string()),
    scanFrequency: v.optional(v.string()),
    skipExisting: v.optional(v.boolean()),
    scrapeOptions: v.optional(scrapeOptions),
  },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, { chatbotId, ...body }) =>
    sitegptRequest({
      method: 'POST',
      path: chatbotPath(chatbotId, '/knowledge/sitemap'),
      body,
    }),
})

/** Crawl a website by following links from a starting URL. */
export const crawlWebsite = action({
  args: {
    chatbotId: v.string(),
    url: v.string(),
    maxDepth: v.optional(v.float64()),
    maxLinks: v.optional(v.float64()),
    includePaths: v.optional(v.array(v.string())),
    excludePaths: v.optional(v.array(v.string())),
    allowedDomains: v.optional(v.array(v.string())),
    syncFrequency: v.optional(v.string()),
    skipExisting: v.optional(v.boolean()),
    scrapeOptions: v.optional(scrapeOptions),
  },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, { chatbotId, ...body }) =>
    sitegptRequest({
      method: 'POST',
      path: chatbotPath(chatbotId, '/knowledge/website'),
      body,
    }),
})

/** Ingest YouTube video transcripts. */
export const addYoutube = action({
  args: {
    chatbotId: v.string(),
    urls: v.array(v.string()),
    syncFrequency: v.optional(v.string()),
  },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, { chatbotId, ...body }) =>
    sitegptRequest({
      method: 'POST',
      path: chatbotPath(chatbotId, '/knowledge/youtube'),
      body,
    }),
})

/**
 * Set the chatbot's single custom-text slot. Note this REPLACES the previous
 * custom text; for many independent documents use the sync API
 * (syncDocument) or uploadFiles instead.
 */
export const setCustomText = action({
  args: {
    chatbotId: v.string(),
    text: v.string(),
    name: v.optional(v.string()),
  },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, { chatbotId, ...body }) =>
    sitegptRequest({
      method: 'POST',
      path: chatbotPath(chatbotId, '/knowledge/text'),
      body,
    }),
})

/** Upload files (base64-encoded) as knowledge documents, one per file. */
export const uploadFiles = action({
  args: {
    chatbotId: v.string(),
    files: v.array(
      v.object({
        name: v.string(),
        type: v.string(),
        base64: v.string(),
      }),
    ),
  },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, { chatbotId, ...body }) =>
    sitegptRequest({
      method: 'POST',
      path: chatbotPath(chatbotId, '/knowledge/files'),
      body,
    }),
})

/** List knowledge documents with cursor pagination and filters. */
export const listDocuments = action({
  args: {
    chatbotId: v.string(),
    limit: v.optional(v.float64()),
    cursor: v.optional(v.string()),
    ...documentFilters,
  },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, { chatbotId, sources, statuses, types, ...rest }) =>
    sitegptRequest({
      method: 'GET',
      path: chatbotPath(chatbotId, '/documents'),
      query: {
        ...rest,
        source: sources,
        status: statuses,
        type: types,
      },
    }),
})

/** Fetch one knowledge document, optionally inlining its text content. */
export const getDocument = action({
  args: {
    chatbotId: v.string(),
    documentId: v.string(),
    includeContent: v.optional(v.boolean()),
    maxContentChars: v.optional(v.float64()),
  },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, args) =>
    sitegptRequest({
      method: 'GET',
      path: chatbotPath(
        args.chatbotId,
        `/documents/${encodeURIComponent(args.documentId)}`,
      ),
      query: {
        includeContent: args.includeContent ? 'true' : undefined,
        maxContentChars: args.maxContentChars,
      },
    }),
})

/** Replace a knowledge document's text content (re-embeds automatically). */
export const updateDocumentContent = action({
  args: {
    chatbotId: v.string(),
    documentId: v.string(),
    content: v.string(),
  },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, args) =>
    sitegptRequest({
      method: 'PATCH',
      path: chatbotPath(
        args.chatbotId,
        `/documents/${encodeURIComponent(args.documentId)}`,
      ),
      body: { content: args.content },
    }),
})

/** Delete one knowledge document. */
export const deleteDocument = action({
  args: {
    chatbotId: v.string(),
    documentId: v.string(),
  },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, args) =>
    sitegptRequest({
      method: 'DELETE',
      path: chatbotPath(
        args.chatbotId,
        `/documents/${encodeURIComponent(args.documentId)}`,
      ),
      query: { confirm: 'true' },
    }),
})

/** Bulk-delete knowledge documents by ids or filters. */
export const deleteDocuments = action({
  args: {
    chatbotId: v.string(),
    documentIds: v.optional(v.array(v.string())),
    state: v.optional(v.string()),
    all: v.optional(v.boolean()),
    ...documentFilters,
  },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, { chatbotId, ...body }) =>
    sitegptRequest({
      method: 'POST',
      path: chatbotPath(chatbotId, '/documents/delete'),
      body: { ...body, confirm: true },
    }),
})

/** Queue a re-scrape/re-embed for documents selected by ids or filters. */
export const resyncDocuments = action({
  args: {
    chatbotId: v.string(),
    documentIds: v.optional(v.array(v.string())),
    state: v.optional(v.string()),
    all: v.optional(v.boolean()),
    ...documentFilters,
  },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, { chatbotId, ...body }) =>
    sitegptRequest({
      method: 'POST',
      path: chatbotPath(chatbotId, '/documents/resync'),
      body,
    }),
})

/** Aggregate knowledge stats: counts by source/status/type plus usage. */
export const getDocumentStats = action({
  args: {
    chatbotId: v.string(),
    ...documentFilters,
  },
  // Raw SiteGPT API payload; shapes are documented in src/types.ts.
  returns: v.any(),
  handler: async (_ctx, { chatbotId, sources, statuses, types, query }) =>
    sitegptRequest({
      method: 'GET',
      path: chatbotPath(chatbotId, '/documents/stats'),
      query: {
        query,
        source: sources,
        status: statuses,
        type: types,
      },
    }),
})
