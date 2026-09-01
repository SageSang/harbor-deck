import { z } from 'zod'
import { requestJson } from '@/features/config/api'

const groupExpansionSnapshotSchema = z.object({
  initialized: z.boolean(),
  version: z.literal(1),
  expandedGroupKeys: z.array(z.string()),
})

export type GroupExpansionSnapshot = z.infer<typeof groupExpansionSnapshotSchema>

export const groupExpansionQueryKey = ['preferences', 'navigation', 'groups'] as const

function parseSnapshot(value: unknown) {
  return groupExpansionSnapshotSchema.parse(value)
}

export async function fetchGroupExpansionPreference() {
  return parseSnapshot(await requestJson<unknown>('/api/preferences/navigation/groups'))
}

export async function initializeGroupExpansionPreference(expandedGroupKeys: string[]) {
  return parseSnapshot(
    await requestJson<unknown>('/api/preferences/navigation/groups/initialize', {
      method: 'POST',
      body: JSON.stringify({ expandedGroupKeys }),
    })
  )
}

export async function saveGroupExpansion(sceneId: string, groupId: string, expanded: boolean) {
  return parseSnapshot(
    await requestJson<unknown>(
      `/api/preferences/navigation/scenes/${encodeURIComponent(sceneId)}/groups/${encodeURIComponent(groupId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ expanded }),
      }
    )
  )
}

export async function saveSceneGroupExpansion(sceneId: string, expanded: boolean) {
  return parseSnapshot(
    await requestJson<unknown>(
      `/api/preferences/navigation/scenes/${encodeURIComponent(sceneId)}/groups`,
      {
        method: 'PUT',
        body: JSON.stringify({ expanded }),
      }
    )
  )
}

export function parseGroupExpansionSnapshot(value: unknown) {
  return groupExpansionSnapshotSchema.safeParse(value)
}
