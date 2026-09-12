import { fetchRemoteTheme, probeAvailableTarget } from './network'
import {
  readSettings,
  readResolutionCache,
  writeResolutionSnapshot,
  writeExtensionTheme,
} from './storage'
import {
  isFreshResolution,
  sameSettings,
  matchesSettings,
  emptyResolution,
} from './resolutionState'
import type { ExtensionSettings, NewTabBootSnapshot } from './types'

export class SettingsChangedError extends Error {
  constructor() {
    super('Settings changed during address detection')
  }
}

export function createResolutionCoordinator() {
  let generation = 0
  let job: {
    generation: number
    settings: ExtensionSettings
    verifySingle: boolean
    invalidatesCache: boolean
    failedUrls: string[]
    promise: Promise<NewTabBootSnapshot>
  } | null = null
  let commits: Promise<unknown> = Promise.resolve()
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = commits.catch(() => undefined).then(operation)
    commits = next
    return next
  }
  const invalidate = () => {
    generation += 1
    job = null
  }

  async function refresh(
    options: { force?: boolean; failedUrl?: string; verifySingle?: boolean } = {}
  ) {
    const settings = await readSettings()
    let previous = await readResolutionCache()
    const previousJob = job && sameSettings(job.settings, settings) ? job : null
    if (previousJob && !options.failedUrl && (!options.verifySingle || previousJob.verifySingle))
      return previousJob.promise
    if (
      !previousJob &&
      !options.force &&
      !options.failedUrl &&
      !options.verifySingle &&
      isFreshResolution(previous, settings)
    )
      return previous!
    const failedUrls = [
      ...new Set([
        ...(matchesSettings(previous, settings) ? previous.failedUrls : []),
        ...(previousJob?.failedUrls ?? []),
        ...(options.failedUrl &&
        [settings.primaryUrl, settings.fallbackUrl].includes(options.failedUrl)
          ? [options.failedUrl]
          : []),
      ]),
    ]
    const invalidatesCache = Boolean(
      previousJob?.invalidatesCache ||
      (options.failedUrl && [settings.primaryUrl, settings.fallbackUrl].includes(options.failedUrl))
    )
    const ownGeneration = ++generation
    const promise = (async () => {
      if (invalidatesCache) {
        const failure: NewTabBootSnapshot = {
          ...(matchesSettings(previous, settings) ? previous : emptyResolution(settings)),
          activeUrl: '',
          status: 'failed',
          reason: 'unreachable',
          verifiedAt: null,
          lastAttemptAt: Date.now(),
          failedUrls,
        }
        await serialize(async () => {
          const latest = await readSettings()
          if (generation !== ownGeneration || !sameSettings(settings, latest))
            throw new SettingsChangedError()
          await writeResolutionSnapshot(failure)
        })
        previous = failure
      }
      const result = await probeAvailableTarget(settings, previous, options)
      await serialize(async () => {
        const latest = await readSettings()
        if (generation !== ownGeneration || !sameSettings(settings, latest))
          throw new SettingsChangedError()
        await writeResolutionSnapshot(result)
      })
      // Address publication and response never wait for the theme request.
      void (async () => {
        if (!result.activeUrl) return
        const skin = await fetchRemoteTheme(result.activeUrl, settings.apiToken)
        if (!skin) return
        await serialize(async () => {
          const latest = await readSettings()
          if (generation === ownGeneration && sameSettings(settings, latest))
            await writeExtensionTheme(skin)
        })
      })().catch(() => undefined)
      return result
    })().finally(() => {
      if (job?.generation === ownGeneration) job = null
    })
    job = {
      generation: ownGeneration,
      settings,
      promise,
      verifySingle: options.verifySingle === true,
      invalidatesCache,
      failedUrls,
    }
    return promise
  }
  return { refresh, invalidate }
}
