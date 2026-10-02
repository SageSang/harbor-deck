import { z } from 'zod'
import {
  STORAGE_KEY,
  POPUP_DRAFT_KEY,
  POPUP_DRAFTS_KEY,
  POPUP_COLLAPSED_SCENES_KEY,
  EXTENSION_THEME_STORAGE_KEY,
  RESOLUTION_CACHE_KEY,
  NEW_TAB_BOOT_SNAPSHOT_KEY,
  defaultSettings,
  normalizeSettings,
  readLanguage,
  writeLanguage,
} from './storage'
import type { createSettingsCoordinator } from './settingsCoordinator'
import { MAX_TRANSFER_BYTES } from './transferClient'

const text = z.string().max(200_000)
const address = z
  .string()
  .max(8192)
  .refine((value) => {
    if (!value) return true
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol)
    } catch {
      return false
    }
  })
const submission = z
  .object({
    name: text,
    primaryUrl: text,
    secondaryUrl: text.optional(),
    note: text.optional(),
    placements: z.array(z.object({ sceneId: text, groupId: text }).strict()),
    existingBookmarkSlug: text.optional(),
    recordSceneId: text.optional(),
  })
  .strict()
const draft = z
  .object({
    sourceTabUrl: text.optional(),
    tabUrl: text,
    tabTitle: text,
    secondaryUrl: text.optional(),
    note: text.optional(),
    selectedGroups: z.record(text),
    instanceKey: text.optional(),
    pendingSubmission: submission.optional(),
    recordSceneId: text.optional(),
    existingBookmarkSlug: text.optional(),
  })
  .strict()
const schema = z
  .object({
    format: z.literal('harbordeck-extension-transfer'),
    version: z.literal(1),
    sourceExtensionId: z.string().regex(/^[a-p]{32}$/),
    exportedAt: z.string().datetime(),
    tokenOmitted: z.boolean(),
    settings: z
      .object({
        primaryUrl: address,
        fallbackUrl: address,
        localExperienceVersion: z.literal(1).optional(),
        openMode: z.enum(['direct', 'embedded', 'local']),
        probeTimeoutMs: z.number().int().min(50).max(5000),
      })
      .strict(),
    language: z.enum(['zh-CN', 'en']),
    local: z
      .object({
        legacyDraft: draft.nullable(),
        drafts: z.record(draft),
        collapsedScenes: z.array(text),
        theme: z.enum(['midnight', 'frost', 'ember']).optional(),
      })
      .strict(),
  })
  .strict()
type Transfer = z.infer<typeof schema>
const localKeys = [
  POPUP_DRAFT_KEY,
  POPUP_DRAFTS_KEY,
  POPUP_COLLAPSED_SCENES_KEY,
  EXTENSION_THEME_STORAGE_KEY,
]
export class TransferError extends Error {
  constructor(public code: 'invalid-transfer' | 'target-not-empty' | 'transfer-too-large') {
    super(code)
  }
}
function validated(value: unknown): Transfer {
  const result = schema.safeParse(value)
  if (!result.success) throw new TransferError('invalid-transfer')
  for (const [key, value] of Object.entries(result.data.local.drafts)) {
    if (
      !value.instanceKey ||
      key !== JSON.stringify([value.instanceKey, value.sourceTabUrl ?? value.tabUrl])
    )
      throw new TransferError('invalid-transfer')
  }
  return result.data
}
export function parseTransfer(value: string): Transfer {
  if (value.length > MAX_TRANSFER_BYTES) throw new TransferError('transfer-too-large')
  try {
    return validated(JSON.parse(value))
  } catch (error) {
    if (error instanceof TransferError) throw error
    throw new TransferError('invalid-transfer')
  }
}
function hasValues(value: unknown) {
  return (
    value !== undefined &&
    value !== null &&
    (typeof value !== 'object' || Object.keys(value).length > 0)
  )
}

export function createTransferService(connections: ReturnType<typeof createSettingsCoordinator>) {
  return {
    export: () =>
      connections.serialize(async () => {
        const settings = await connections.load()
        const local = await chrome.storage.local.get(localKeys)
        const file = validated({
          format: 'harbordeck-extension-transfer',
          version: 1,
          sourceExtensionId: chrome.runtime.id,
          exportedAt: new Date().toISOString(),
          tokenOmitted: Boolean(settings.apiToken),
          settings: {
            primaryUrl: settings.primaryUrl,
            fallbackUrl: settings.fallbackUrl,
            openMode: settings.openMode,
            localExperienceVersion: settings.localExperienceVersion,
            probeTimeoutMs: settings.probeTimeoutMs,
          },
          language: await readLanguage(),
          local: {
            legacyDraft: local[POPUP_DRAFT_KEY] ?? null,
            drafts: local[POPUP_DRAFTS_KEY] ?? {},
            collapsedScenes: local[POPUP_COLLAPSED_SCENES_KEY] ?? [],
            theme: local[EXTENSION_THEME_STORAGE_KEY],
          },
        })
        const json = JSON.stringify(file, null, 2)
        if (new TextEncoder().encode(json).length > MAX_TRANSFER_BYTES)
          throw new TransferError('transfer-too-large')
        return json
      }),
    import: (json: string) =>
      connections.serialize(async () => {
        const file = parseTransfer(json)
        const current = await connections.load()
        const existing = await chrome.storage.local.get(localKeys)
        if (
          current.primaryUrl ||
          current.fallbackUrl ||
          current.apiToken ||
          current.openMode !== defaultSettings.openMode ||
          current.probeTimeoutMs !== defaultSettings.probeTimeoutMs ||
          localKeys.some((key) => hasValues(existing[key]))
        )
          throw new TransferError('target-not-empty')
        const settings = normalizeSettings({ ...file.settings, apiToken: '' })
        // All durable local data lands in one write. No import ever issues a bookmark request.
        await chrome.storage.local.set({
          [STORAGE_KEY]: settings,
          [POPUP_DRAFT_KEY]: file.local.legacyDraft,
          [POPUP_DRAFTS_KEY]: file.local.drafts,
          [POPUP_COLLAPSED_SCENES_KEY]: file.local.collapsedScenes,
          ...(file.local.theme ? { [EXTENSION_THEME_STORAGE_KEY]: file.local.theme } : {}),
          [RESOLUTION_CACHE_KEY]: null,
          [NEW_TAB_BOOT_SNAPSHOT_KEY]: null,
        })
        let languageApplied = true
        try {
          await writeLanguage(file.language)
        } catch {
          languageApplied = false
        }
        return {
          settings,
          language: file.language,
          languageApplied,
          tokenOmitted: file.tokenOmitted,
          draftCount:
            Object.keys(file.local.drafts).length + Number(Boolean(file.local.legacyDraft)),
        }
      }),
  }
}
