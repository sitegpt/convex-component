import { v } from 'convex/values'

import { action } from './_generated/server.js'
import { chatbotPath, sitegptRequest } from './lib/http.js'

type MessagePayload = {
  messageId: string
  answer?: { text: string; timestamp: string } | null
  [key: string]: unknown
}

/**
 * Send a visitor/user message to the chatbot and get the AI answer back. The
 * SiteGPT API generates the reply synchronously, so the returned message
 * carries both the question and the answer.
 *
 * With no threadId a new conversation is created and returned; pass the
 * returned threadId on follow-up calls to continue the same conversation.
 */
export const ask = action({
  args: {
    chatbotId: v.string(),
    message: v.string(),
    threadId: v.optional(v.string()),
    pageUrl: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const body = {
      message: args.message,
      pageUrl: args.pageUrl ?? null,
    }
    if (args.threadId) {
      const data = (await sitegptRequest({
        method: 'POST',
        path: chatbotPath(
          args.chatbotId,
          `/conversations/${encodeURIComponent(args.threadId)}/messages`,
        ),
        body,
      })) as { message: MessagePayload }
      return {
        threadId: args.threadId,
        answer: data.message.answer?.text ?? null,
        message: data.message,
        conversation: null,
      }
    }
    const data = (await sitegptRequest({
      method: 'POST',
      path: chatbotPath(args.chatbotId, '/messages'),
      body,
    })) as {
      conversation: { threadId: string; [key: string]: unknown }
      message: MessagePayload
    }
    return {
      threadId: data.conversation.threadId,
      answer: data.message.answer?.text ?? null,
      message: data.message,
      conversation: data.conversation,
    }
  },
})
