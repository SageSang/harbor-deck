export interface SceneOption {
  id: string
  name: string
  groups: Array<{ id: string; name: string }>
}

export function filterCategoryScenes(scenes: SceneOption[], query: string): SceneOption[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return scenes
  return scenes
    .map((scene) => ({
      ...scene,
      groups: scene.groups.filter((group) => {
        const path = `${scene.name} / ${group.name}`.toLocaleLowerCase()
        return words.every((word) => path.includes(word))
      }),
    }))
    .filter((scene) => scene.groups.length > 0)
}

export function invalidCategoryTargets(scenes: SceneOption[], selected: Record<string, string>) {
  return Object.entries(selected).filter(
    ([sceneId, groupId]) =>
      !scenes.some(
        (scene) => scene.id === sceneId && scene.groups.some((group) => group.id === groupId)
      )
  )
}
