import { ConvexError } from 'convex/values'

import { env } from '../_generated/server.js'

export const DEFAULT_API_BASE = 'https://sitegpt.ai'

export type SiteGptApiErrorData = {
  kind: 'SiteGptApiError'
  status: number
  code: string
  message: string
  hint?: string
  requestId?: string
}

type QueryValue = boolean | number | string | string[] | undefined

/**
 * The SiteGPT agent API envelope: `{ ok: true, data }` on success,
 * `{ ok: false, error: { code, message, hint?, details? } }` on failure.
 */
type Envelope =
  | {
      ok: true
      data: unknown
      requestId?: string
      warnings?: string[]
    }
  | {
      ok: false
      error: { code?: string; message?: string; hint?: string }
      requestId?: string
    }

function getApiToken(): string {
  if (!env.SITEGPT_API_TOKEN) {
    throw new ConvexError(
      'SITEGPT_API_TOKEN is not configured. Set it on the Convex deployment ' +
        '(npx convex env set SITEGPT_API_TOKEN ...) and pass it to the ' +
        'component in convex.config.ts before calling SiteGPT.',
    )
  }
  return env.SITEGPT_API_TOKEN
}

export function getApiBase(): string {
  const base = env.SITEGPT_API_BASE || DEFAULT_API_BASE
  return base.replace(/\/+$/u, '')
}

function buildQueryString(query: Record<string, QueryValue> | undefined): string {
  if (!query) {
    return ''
  }
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item)
      }
      continue
    }
    params.append(key, String(value))
  }
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

export function isSiteGptApiError(
  error: unknown,
  status?: number,
): error is ConvexError<SiteGptApiErrorData> {
  if (!(error instanceof ConvexError)) {
    return false
  }
  const data = error.data as Partial<SiteGptApiErrorData> | undefined
  if (!data || data.kind !== 'SiteGptApiError') {
    return false
  }
  return status === undefined || data.status === status
}

export async function sitegptRequest({
  method,
  path,
  body,
  query,
}: {
  method: 'DELETE' | 'GET' | 'PATCH' | 'POST'
  path: string
  body?: unknown
  query?: Record<string, QueryValue>
}): Promise<unknown> {
  const token = getApiToken()
  const url = `${getApiBase()}${path}${buildQueryString(query)}`

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

  const text = await response.text()
  let json: unknown
  try {
    json = text.length === 0 ? null : JSON.parse(text)
  } catch {
    throw new ConvexError({
      kind: 'SiteGptApiError',
      status: response.status,
      code: 'NON_JSON_RESPONSE',
      message: `Expected JSON from the SiteGPT API but received ${
        response.headers.get('content-type') ?? 'unknown'
      } (HTTP ${response.status}) from ${method} ${path}.`,
    } satisfies SiteGptApiErrorData)
  }

  if (!json || typeof json !== 'object' || !('ok' in json)) {
    throw new ConvexError({
      kind: 'SiteGptApiError',
      status: response.status,
      code: 'INVALID_API_RESPONSE',
      message: `Received an invalid SiteGPT API response (HTTP ${response.status}) from ${method} ${path}. Check SITEGPT_API_BASE.`,
    } satisfies SiteGptApiErrorData)
  }

  const envelope = json as Envelope
  if (!envelope.ok) {
    throw new ConvexError({
      kind: 'SiteGptApiError',
      status: response.status,
      code: envelope.error?.code ?? 'UNKNOWN_ERROR',
      message: envelope.error?.message ?? `SiteGPT API request failed (HTTP ${response.status}).`,
      ...(envelope.error?.hint ? { hint: envelope.error.hint } : {}),
      ...(envelope.requestId ? { requestId: envelope.requestId } : {}),
    } satisfies SiteGptApiErrorData)
  }

  return envelope.data
}

export function chatbotPath(chatbotId: string, suffix = ''): string {
  return `/api/v2/chatbots/${encodeURIComponent(chatbotId)}${suffix}`
}

export function errorText(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as Partial<SiteGptApiErrorData> | undefined
    if (data && data.kind === 'SiteGptApiError') {
      return `${data.code} (HTTP ${data.status}): ${data.message}`
    }
    return typeof error.data === 'string' ? error.data : error.message
  }
  return error instanceof Error ? error.message : String(error)
}
