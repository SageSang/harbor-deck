interface ChromeStorageArea {
  get(key: string): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string | string[]): Promise<void>
}

interface ChromeStorageNamespace {
  sync: ChromeStorageArea
  local: ChromeStorageArea
}

interface ChromePermissionsNamespace {
  contains(details: { origins: string[] }): Promise<boolean>
  request(details: { origins: string[] }): Promise<boolean>
}

interface ChromeRuntimeNamespace {
  openOptionsPage(): Promise<void>
  sendMessage(message: unknown): Promise<unknown>
  onMessage: {
    addListener(
      callback: (
        message: unknown,
        sender: unknown,
        sendResponse: (response?: unknown) => void
      ) => boolean | void
    ): void
  }
}

interface ChromeTab {
  id?: number
  title?: string
  url?: string
}

interface ChromeTabsNamespace {
  query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<ChromeTab[]>
}

interface ChromeActionNamespace {
  onClicked: {
    addListener(callback: () => void): void
  }
}

interface ChromeLike {
  action: ChromeActionNamespace
  permissions: ChromePermissionsNamespace
  runtime: ChromeRuntimeNamespace
  storage: ChromeStorageNamespace
  tabs: ChromeTabsNamespace
}

declare const chrome: ChromeLike
