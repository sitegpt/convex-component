import { SiteGPT } from '@sitegpt/convex'
import { v } from 'convex/values'

import { components } from './_generated/api'
import { action } from './_generated/server'

const sitegpt = new SiteGPT(components.sitegpt, {
  defaultChatbotId: 'YOUR_CHATBOT_ID',
})

/**
 * An in-app "Ask AI" box: send the user's question to the support chatbot
 * and return the answer plus the thread id for follow-ups.
 */
export const ask = action({
  args: {
    question: v.string(),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const result = await sitegpt.ask(ctx, {
      message: args.question,
      threadId: args.threadId,
    })
    return { answer: result.answer, threadId: result.threadId }
  },
})
