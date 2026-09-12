import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import {
  appConfigSchema,
  storedNavigationConfigSchema,
  systemConfigSchema,
  type AppConfig,
  type NavigationConfig,
} from '../src/config/schema.js'
import { cleanAppGroupExpansionPreference } from '../src/features/navigation/groupExpansion.js'

const configDir = path.resolve(process.env.CONFIG_DIR ?? path.join(process.cwd(), 'config'))
const configFilename = 'config.json'

let ensureConfigPromise: Promise<string> | null = null
let writeQueue: Promise<void> = Promise.resolve()

type AuthConfig = NonNullable<AppConfig['system']['auth']>

export class AuthConfigConflictError extends Error {}

export class ConfigCommitError extends Error {
  readonly committed = true
}

function sameAuth(left: AuthConfig | null | undefined, right: AuthConfig | null | undefined) {
  return left?.username === right?.username && left?.passwordHash === right?.passwordHash
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function exists(filePath: string) {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function ensureDirectory() {
  await mkdir(configDir, { recursive: true })
}

async function readJsonFile<TSchema extends z.ZodTypeAny>(
  filePath: string,
  filename: string,
  schema: TSchema
): Promise<z.output<TSchema>> {
  const text = await readFile(filePath, 'utf8')
  const trimmed = text.trim()

  if (!trimmed) {
    return schema.parse(undefined)
  }

  let json: unknown
  try {
    json = JSON.parse(trimmed)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    throw new Error(`${filename} JSON 格式错误：${message}`)
  }

  return schema.parse(json ?? undefined)
}

async function writeJsonFile(
  filePath: string,
  value: unknown,
  commit?: { beforeRename?: () => void; onCommitted: () => void }
) {
  // Revisions belong to client snapshots, never to the durable configuration.
  if (isRecord(value) && isRecord(value.system) && isRecord(value.navigation)) {
    const system = { ...value.system }
    const navigation = { ...value.navigation }
    delete system._revision
    delete navigation._revision
    value = { ...value, system, navigation }
  }
  const tempPath = `${filePath}.${randomUUID()}.tmp`
  let committed = false

  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    commit?.beforeRename?.()
    await rename(tempPath, filePath)
    committed = true
    try {
      commit?.onCommitted()
    } catch (cause) {
      throw new ConfigCommitError('配置已保存，但访问状态更新失败', { cause })
    }
  } finally {
    if (!committed && (await exists(tempPath))) {
      await unlink(tempPath)
    }
  }
}

async function ensureAppConfigFile() {
  if (ensureConfigPromise) {
    return ensureConfigPromise
  }

  ensureConfigPromise = (async () => {
    await ensureDirectory()

    const targetPath = path.join(configDir, configFilename)
    if (await exists(targetPath)) {
      return targetPath
    }

    await writeJsonFile(targetPath, appConfigSchema.parse({}))
    return targetPath
  })()

  try {
    return await ensureConfigPromise
  } finally {
    ensureConfigPromise = null
  }
}

async function withWriteLock<T>(operation: () => Promise<T>) {
  const nextOperation = writeQueue.then(operation, operation)
  writeQueue = nextOperation.then(
    () => undefined,
    () => undefined
  )
  return nextOperation
}

export async function readAppConfig() {
  const filePath = await ensureAppConfigFile()
  const config = await readJsonFile(filePath, configFilename, appConfigSchema)
  storedNavigationConfigSchema.parse(config.navigation)
  return cleanAppGroupExpansionPreference(config)
}

/** Inspect and synchronously use the latest state in the existing commit queue, without writing. */
export async function inspectAppConfig<TResult>(inspect: (current: AppConfig) => TResult) {
  return withWriteLock(async () => inspect(await readAppConfig()))
}

export async function commitAuthConfig(input: {
  expectedAuth: AuthConfig | null
  auth: AuthConfig
  assertSessionValid?: () => void
  onCommitted: () => void
}) {
  return withWriteLock(async () => {
    const current = await readAppConfig()
    if (!sameAuth(current.system.auth, input.expectedAuth)) {
      throw new AuthConfigConflictError(
        input.expectedAuth ? '认证状态已变化，请重新登录后重试' : '管理员账号已存在'
      )
    }
    input.assertSessionValid?.()
    const next = appConfigSchema.parse({
      ...current,
      system: { ...current.system, auth: input.auth },
    })
    const filePath = await ensureAppConfigFile()
    await writeJsonFile(filePath, next, {
      beforeRename: input.assertSessionValid,
      onCommitted: input.onCommitted,
    })
    return next.system.auth!
  })
}

/** A scene password commit owns the synchronous invalidation of scene access. */
export async function commitScenePasswordConfig(
  sceneId: string,
  passwordHash: string | undefined,
  assertCurrentAccess: (current: AppConfig) => void,
  onCommitted: () => void
) {
  return withWriteLock(async () => {
    const current = await readAppConfig()
    assertCurrentAccess(current)
    const navigation = storedNavigationConfigSchema.parse({
      ...current.navigation,
      scenes: current.navigation.scenes.map((scene) =>
        scene.id === sceneId ? { ...scene, protected: Boolean(passwordHash), passwordHash } : scene
      ),
    })
    const next = { ...current, navigation }
    const filePath = await ensureAppConfigFile()
    await writeJsonFile(filePath, next, {
      beforeRename: () => assertCurrentAccess(current),
      onCommitted,
    })
    return navigation
  })
}

/** Restore authorization is decided against the state immediately before this commit. */
export async function commitRestoredAppConfig(
  value: unknown,
  canCommit: () => boolean,
  onCommitted: (requiresReauth: boolean) => void
) {
  const restoredConfig = cleanAppGroupExpansionPreference(appConfigSchema.parse(value))
  storedNavigationConfigSchema.parse(restoredConfig.navigation)
  return withWriteLock(async () => {
    const assertNotCancelled = () => {
      if (!canCommit()) throw new Error('恢复已取消')
    }
    assertNotCancelled()
    const current = await readAppConfig()
    const requiresReauth = !sameAuth(current.system.auth, restoredConfig.system.auth)
    const filePath = await ensureAppConfigFile()
    await writeJsonFile(filePath, restoredConfig, {
      beforeRename: assertNotCancelled,
      onCommitted: () => onCommitted(requiresReauth),
    })
    return { restoredConfig, requiresReauth }
  })
}

export async function writeAppConfig(value: unknown) {
  if (!isRecord(value)) {
    throw new Error('整站配置格式错误')
  }

  const parsed = cleanAppGroupExpansionPreference(appConfigSchema.parse(value))
  storedNavigationConfigSchema.parse(parsed.navigation)

  return withWriteLock(async () => {
    const filePath = await ensureAppConfigFile()
    await writeJsonFile(filePath, parsed)
    return parsed
  })
}

export async function readNavigationConfig() {
  const config = await readAppConfig()
  return config.navigation
}

export async function writeNavigationConfig(value: unknown) {
  if (!isRecord(value)) {
    throw new Error('导航配置格式错误')
  }

  const navigation = storedNavigationConfigSchema.parse(value)

  return withWriteLock(async () => {
    const currentConfig = await readAppConfig()
    const nextConfig = cleanAppGroupExpansionPreference({
      ...currentConfig,
      navigation,
    })

    const filePath = await ensureAppConfigFile()
    await writeJsonFile(filePath, nextConfig)
    return nextConfig.navigation
  })
}

export async function mutateNavigationConfig<TResult>(
  mutation: (current: NavigationConfig) => { navigation: unknown; result: TResult }
) {
  return withWriteLock(async () => {
    const currentConfig = await readAppConfig()
    const mutationResult = mutation(currentConfig.navigation)
    const navigation = storedNavigationConfigSchema.parse(mutationResult.navigation)
    const nextConfig = cleanAppGroupExpansionPreference({
      ...currentConfig,
      navigation,
    })

    const filePath = await ensureAppConfigFile()
    await writeJsonFile(filePath, nextConfig)
    return {
      navigation: nextConfig.navigation,
      result: mutationResult.result,
    }
  })
}

export async function previewNavigationConfig<TResult>(
  mutation: (current: NavigationConfig) => { navigation: unknown; result: TResult }
) {
  return withWriteLock(async () => {
    const currentConfig = await readAppConfig()
    const mutationResult = mutation(currentConfig.navigation)
    const navigation = storedNavigationConfigSchema.parse(mutationResult.navigation)

    return {
      navigation,
      result: mutationResult.result,
    }
  })
}

export async function mutateAppConfig<TResult>(
  mutation: (current: AppConfig) => { appConfig: unknown; result: TResult }
) {
  return withWriteLock(async () => {
    const currentConfig = await readAppConfig()
    const mutationResult = mutation(currentConfig)
    const appConfig = cleanAppGroupExpansionPreference(
      appConfigSchema.parse(mutationResult.appConfig)
    )
    storedNavigationConfigSchema.parse(appConfig.navigation)

    const filePath = await ensureAppConfigFile()
    await writeJsonFile(filePath, appConfig)
    return {
      appConfig,
      result: mutationResult.result,
    }
  })
}

export async function readSystemConfig() {
  const config = await readAppConfig()
  return config.system
}

export async function writeSystemConfig(value: unknown) {
  if (!isRecord(value)) {
    throw new Error('系统配置格式错误')
  }

  const system = systemConfigSchema.parse(value)

  return withWriteLock(async () => {
    const currentConfig = await readAppConfig()
    const nextConfig: AppConfig = {
      ...currentConfig,
      system,
    }

    const filePath = await ensureAppConfigFile()
    await writeJsonFile(filePath, nextConfig)
    return nextConfig.system
  })
}

export function getConfigDir() {
  return configDir
}
