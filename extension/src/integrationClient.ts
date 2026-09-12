import { requestResolution } from './resolutionClient'
import type { BookmarkSubmission, ExtensionSettings } from './types'

export class IntegrationHttpError extends Error {
  constructor(public readonly status: number) {
    super(`HTTP ${status}`)
  }
}
export class IntegrationNetworkError extends Error {
  constructor() {
    super('The response could not be completed')
  }
}
export class IntegrationSettingsError extends Error {
  constructor() {
    super('The server settings changed; reopen the popup')
  }
}

export interface ExistingBookmarkResponse {
  bookmark: {
    slug: string
    name: string
    primaryUrl: string
    secondaryUrl?: string
    note?: string
  } | null
  quickRecord?: {
    id: string
    sceneId: string
    name: string
    primaryUrl: string
    secondaryUrl?: string
    note?: string
  } | null
  placements: Array<{ sceneId: string; groupId: string }>
}

export async function integrationRequest<T>(
  baseUrl: string,
  path: string,
  settings: ExtensionSettings,
  options: { body?: BookmarkSubmission; timeoutMs?: number } = {}
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000)
  try {
    const response = await fetch(new URL(path, baseUrl), {
      method: options.body ? 'POST' : 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'X-HarborDeck-Search-Token': settings.apiToken,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    })
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined)
      throw new IntegrationHttpError(response.status)
    }
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof IntegrationHttpError) throw error
    throw new IntegrationNetworkError()
  } finally {
    clearTimeout(timer)
  }
}

/** Read-only recovery: at most one address refresh and one repeated GET. */
export async function getIntegrationJson<T>(
  settings: ExtensionSettings,
  path: string,
  initialUrl?: string
): Promise<T> {
  const target = initialUrl ?? (await requestResolution(settings)).activeUrl
  if (!target) throw new IntegrationNetworkError()
  try {
    return await integrationRequest<T>(target, path, settings)
  } catch (error) {
    if (!(error instanceof IntegrationNetworkError)) throw error
    const refreshed = await requestResolution(settings, {
      force: true,
      failedUrl: target,
      verifySingle: true,
    })
    if (!refreshed.activeUrl) throw error
    return integrationRequest<T>(refreshed.activeUrl, path, settings)
  }
}

export function lookupPath(url: string) {
  return `/api/integrations/bookmarks/lookup?${new URLSearchParams({ url })}`
}

/** Matching content is useful evidence, not proof that an ambiguous POST committed. */
export function matchesSubmission(existing: ExistingBookmarkResponse, body: BookmarkSubmission) {
  const item = body.placements.length ? existing.bookmark : existing.quickRecord
  if (
    !item ||
    item.name !== body.name ||
    item.primaryUrl !== body.primaryUrl ||
    (item.secondaryUrl ?? '') !== (body.secondaryUrl ?? '') ||
    (item.note ?? '') !== (body.note ?? '')
  )
    return false
  if (!body.placements.length) return existing.quickRecord?.sceneId === body.recordSceneId
  return body.placements.every((target) =>
    existing.placements.some(
      (placement) => placement.sceneId === target.sceneId && placement.groupId === target.groupId
    )
  )
}
