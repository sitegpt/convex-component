import type { FunctionReference } from 'convex/server'

type Visibility = 'internal' | 'public'

type SiteGptAction = FunctionReference<'action', Visibility, any, any>
type SiteGptMutation = FunctionReference<'mutation', Visibility, any, any>
type SiteGptQuery = FunctionReference<'query', Visibility, any, any>

/**
 * The shape of the mounted component as seen from the host app
 * (components.sitegpt). Precise argument/result typing lives on the SiteGPT
 * client class; these references are what get passed to
 * ctx.runAction/runMutation/runQuery.
 */
export type ComponentApi = {
  account: {
    me: SiteGptAction
    usage: SiteGptAction
    limits: SiteGptAction
    listChatbots: SiteGptAction
    getChatbot: SiteGptAction
  }
  chat: {
    ask: SiteGptAction
  }
  conversations: {
    list: SiteGptAction
    get: SiteGptAction
    listMessages: SiteGptAction
  }
  knowledge: {
    addLinks: SiteGptAction
    addSitemap: SiteGptAction
    crawlWebsite: SiteGptAction
    addYoutube: SiteGptAction
    setCustomText: SiteGptAction
    uploadFiles: SiteGptAction
    listDocuments: SiteGptAction
    getDocument: SiteGptAction
    updateDocumentContent: SiteGptAction
    deleteDocument: SiteGptAction
    deleteDocuments: SiteGptAction
    resyncDocuments: SiteGptAction
    getDocumentStats: SiteGptAction
  }
  leads: {
    list: SiteGptAction
    get: SiteGptAction
  }
  sync: {
    upsert: SiteGptMutation
    remove: SiteGptMutation
    retry: SiteGptMutation
    get: SiteGptQuery
    list: SiteGptQuery
  }
}
