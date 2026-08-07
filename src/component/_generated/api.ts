import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from 'convex/server'
import { anyApi } from 'convex/server'

import type * as account from '../account.js'
import type * as chat from '../chat.js'
import type * as conversations from '../conversations.js'
import type * as knowledge from '../knowledge.js'
import type * as leads from '../leads.js'
import type * as sync from '../sync.js'

declare const fullApi: ApiFromModules<{
  account: typeof account
  chat: typeof chat
  conversations: typeof conversations
  knowledge: typeof knowledge
  leads: typeof leads
  sync: typeof sync
}>

export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, 'public'>
> = anyApi as any

export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, 'internal'>
> = anyApi as any
