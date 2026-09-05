import { createContext } from 'react'

export interface GroupExpansionContextValue {
  expandedGroupKeys: ReadonlySet<string>
  isReady: boolean
  retry: () => void
  isGroupPending: (sceneId: string, groupId: string) => boolean
  isScenePending: (sceneId: string) => boolean
  setGroupExpanded: (sceneId: string, groupId: string, expanded: boolean) => void
  setSceneGroupsExpanded: (sceneId: string, expanded: boolean) => Promise<boolean>
}

export const GroupExpansionContext = createContext<GroupExpansionContextValue | null>(null)
