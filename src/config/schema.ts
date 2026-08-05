import { z } from 'zod'
import {
  SEARCH_KEYWORD_PLACEHOLDER,
  builtinSearchEngineIds,
  isValidSearchEngineTemplate,
} from './searchEngines.js'
import { isValidNetworkProbeHost, networkProbeProtocols } from './networkProbe.js'
import { isHttpUrl } from './httpUrl.js'

export { isHttpUrl } from './httpUrl.js'

const trimmedString = z.string().trim().min(1)
export const httpUrlSchema = z.string().trim().url().refine(isHttpUrl, '仅支持 HTTP 或 HTTPS 地址')
const optionalUrl = httpUrlSchema.optional()
const positiveInteger = z.number().int().min(1)

export const slugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug 必须使用小写字母、数字和连字符')

export const openTargetSchema = z.enum(['self', 'blank'])

export const authUsernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[A-Za-z0-9._@-]+$/, '用户名只能包含字母、数字、点、下划线、@ 和短横线')

export const authPasswordHashSchema = z.string().trim().min(1)

export const authConfigSchema = z.object({
  username: authUsernameSchema,
  passwordHash: authPasswordHashSchema,
})

export const networkProbeProtocolSchema = z.enum(networkProbeProtocols)

const canonicalServiceConfigSchema = z.object({
  slug: slugSchema,
  name: trimmedString,
  note: z.string().max(5000).optional(),
  icon: z.string().trim().min(1).optional(),
  primaryUrl: httpUrlSchema,
  secondaryUrl: optionalUrl,
  probes: z.array(httpUrlSchema).min(1).optional(),
  forceNewTab: z.boolean().optional(),
})

const legacyServiceConfigSchema = z.object({
  slug: slugSchema,
  name: trimmedString,
  note: z.string().max(5000).optional(),
  icon: z.string().trim().min(1).optional(),
  lanUrl: httpUrlSchema,
  wanUrl: optionalUrl,
  probes: z.array(httpUrlSchema).min(1).optional(),
  forceNewTab: z.boolean().optional(),
})

export const serviceConfigSchema = z
  .union([canonicalServiceConfigSchema, legacyServiceConfigSchema])
  .transform((service) => {
    if ('primaryUrl' in service) {
      return service
    }

    return {
      slug: service.slug,
      name: service.name,
      note: service.note,
      icon: service.icon,
      primaryUrl: service.lanUrl,
      secondaryUrl: service.wanUrl,
      probes: service.probes,
      forceNewTab: service.forceNewTab,
    }
  })
  .pipe(canonicalServiceConfigSchema)

export const serviceGroupConfigSchema = z.object({
  category: trimmedString,
  items: z.array(serviceConfigSchema),
})

export const servicesConfigSchema = z.array(serviceGroupConfigSchema).default([])

export const serviceSchema = canonicalServiceConfigSchema.extend({
  category: trimmedString,
})

export const servicesSchema = z.array(serviceSchema)

/**
 * A quick record is intentionally kept separate from scene groups.  It is
 * searchable in its scene, but does not participate in the normal one-group
 * placement invariant until the user chooses a group while editing it.
 */
export const quickRecordSchema = z.object({
  id: z.string().trim().min(1).max(160),
  name: trimmedString.max(200),
  note: z.string().max(5000).optional(),
  icon: z.string().trim().min(1).optional(),
  primaryUrl: httpUrlSchema,
  secondaryUrl: optionalUrl,
  createdAt: positiveInteger,
  updatedAt: positiveInteger,
})

export const sceneGroupConfigSchema = z.object({
  id: slugSchema,
  name: trimmedString,
  bookmarkIds: z.array(slugSchema).default([]),
})

export const navigationSceneConfigSchema = z.object({
  id: slugSchema,
  name: trimmedString,
  protected: z.boolean().default(false),
  passwordHash: authPasswordHashSchema.optional(),
  groups: z.array(sceneGroupConfigSchema).default([]),
  quickRecords: z.array(quickRecordSchema).default([]),
})

const defaultNavigationConfigValue = {
  defaultSceneId: 'default',
  bookmarks: [],
  scenes: [
    {
      id: 'default',
      name: '默认',
      protected: false,
      groups: [],
      quickRecords: [],
    },
  ],
}

export const navigationConfigSchema = z
  .object({
    defaultSceneId: slugSchema,
    bookmarks: z.array(serviceConfigSchema).default([]),
    scenes: z.array(navigationSceneConfigSchema).min(1),
  })
  .superRefine((config, ctx) => {
    const bookmarkIds = new Set<string>()
    const sceneIds = new Set<string>()

    config.bookmarks.forEach((bookmark, index) => {
      if (bookmarkIds.has(bookmark.slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bookmarks', index, 'slug'],
          message: `书签标识重复：${bookmark.slug}`,
        })
      }
      bookmarkIds.add(bookmark.slug)
    })

    config.scenes.forEach((scene, sceneIndex) => {
      if (sceneIds.has(scene.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scenes', sceneIndex, 'id'],
          message: `场景标识重复：${scene.id}`,
        })
      }
      sceneIds.add(scene.id)

      const groupIds = new Set<string>()
      const groupNames = new Set<string>()
      const placedBookmarkIds = new Set<string>()
      const quickRecordIds = new Set<string>()

      scene.groups.forEach((group, groupIndex) => {
        if (groupIds.has(group.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['scenes', sceneIndex, 'groups', groupIndex, 'id'],
            message: `场景分组标识重复：${group.id}`,
          })
        }
        groupIds.add(group.id)

        if (groupNames.has(group.name)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['scenes', sceneIndex, 'groups', groupIndex, 'name'],
            message: `场景分组名称重复：${group.name}`,
          })
        }
        groupNames.add(group.name)

        group.bookmarkIds.forEach((bookmarkId, bookmarkIndex) => {
          if (!bookmarkIds.has(bookmarkId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['scenes', sceneIndex, 'groups', groupIndex, 'bookmarkIds', bookmarkIndex],
              message: `场景引用了不存在的书签：${bookmarkId}`,
            })
          }

          if (placedBookmarkIds.has(bookmarkId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['scenes', sceneIndex, 'groups', groupIndex, 'bookmarkIds', bookmarkIndex],
              message: `同一书签不能在一个场景中重复出现：${bookmarkId}`,
            })
          }
          placedBookmarkIds.add(bookmarkId)
        })
      })

      scene.quickRecords.forEach((record, recordIndex) => {
        if (quickRecordIds.has(record.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['scenes', sceneIndex, 'quickRecords', recordIndex, 'id'],
            message: `快速记录标识重复：${record.id}`,
          })
        }
        quickRecordIds.add(record.id)
      })
    })

    if (!sceneIds.has(config.defaultSceneId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defaultSceneId'],
        message: `默认场景不存在：${config.defaultSceneId}`,
      })
    }
  })
  .default(defaultNavigationConfigValue)

export const storedNavigationConfigSchema = navigationConfigSchema.superRefine((config, ctx) => {
  config.scenes.forEach((scene, sceneIndex) => {
    if (scene.protected && !scene.passwordHash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scenes', sceneIndex, 'passwordHash'],
        message: '受保护场景必须设置密码哈希',
      })
    }
  })
})

const searchEngineTemplateSchema = z
  .string()
  .trim()
  .min(1)
  .refine(isValidSearchEngineTemplate, {
    message: `请输入可用的搜索链接，并包含 ${SEARCH_KEYWORD_PLACEHOLDER}`,
  })

const customSearchEngineSchema = z.object({
  id: slugSchema,
  name: trimmedString,
  urlTemplate: searchEngineTemplateSchema,
})

export const webdavBackupConfigSchema = z
  .object({
    url: z.string().trim().default(''),
    username: z.string().trim().default(''),
    password: z.string().default(''),
    remotePath: z.string().trim().default('/harbor-deck'),
    autoBackup: z.boolean().default(false),
    intervalDays: positiveInteger.max(365).default(7),
    maxVersions: positiveInteger.max(365).default(10),
  })
  .superRefine((config, ctx) => {
    const hasAnyCredential =
      config.url.length > 0 || config.username.length > 0 || config.password.length > 0

    if (config.url.length > 0) {
      try {
        if (!isHttpUrl(config.url)) {
          throw new Error('Unsupported WebDAV URL protocol')
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['url'],
          message: '请输入合法的 WebDAV 地址',
        })
      }
    }

    if (!hasAnyCredential && !config.autoBackup) {
      return
    }

    if (!config.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: '请输入 WebDAV 地址',
      })
    }

    if (!config.username) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['username'],
        message: '请输入 WebDAV 用户名',
      })
    }

    if (!config.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: '请输入 WebDAV 密码',
      })
    }
  })

export const networkProbeConfigSchema = z
  .object({
    lanProtocol: networkProbeProtocolSchema.default('http'),
    lanHost: z.string().trim().default(''),
    wanProtocol: networkProbeProtocolSchema.default('https'),
    wanHost: z.string().trim().default(''),
  })
  .superRefine((config, ctx) => {
    if (config.lanHost && !isValidNetworkProbeHost(config.lanHost)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lanHost'],
        message: '请输入合法的内网主机或 IP，可选端口，但不要包含协议或路径',
      })
    }

    if (config.wanHost && !isValidNetworkProbeHost(config.wanHost)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['wanHost'],
        message: '请输入合法的外网主机或域名，可选端口，但不要包含协议或路径',
      })
    }
  })
  .default({})

export const systemConfigSchema = z
  .object({
    appName: trimmedString.default('HarborDeck'),
    darkMode: z.boolean().default(false),
    clickOpenTarget: openTargetSchema.default('self'),
    middleClickOpenTarget: openTargetSchema.default('blank'),
    defaultSearchEngine: slugSchema.default('google'),
    customSearchEngines: z.array(customSearchEngineSchema).default([]),
    networkProbe: networkProbeConfigSchema.default({}),
    webdavBackup: webdavBackupConfigSchema.default({}),
    auth: authConfigSchema.optional(),
  })
  .superRefine((config, ctx) => {
    const customEngineIds = new Set<string>()

    config.customSearchEngines.forEach((engine, index) => {
      if (builtinSearchEngineIds.includes(engine.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customSearchEngines', index, 'id'],
          message: `自定义搜索引擎标识不能与内置引擎重复：${engine.id}`,
        })
        return
      }

      if (customEngineIds.has(engine.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customSearchEngines', index, 'id'],
          message: `自定义搜索引擎标识重复：${engine.id}`,
        })
        return
      }

      customEngineIds.add(engine.id)
    })

    const availableEngineIds = new Set([...builtinSearchEngineIds, ...customEngineIds])

    if (!availableEngineIds.has(config.defaultSearchEngine)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defaultSearchEngine'],
        message: `默认搜索引擎不存在：${config.defaultSearchEngine}`,
      })
    }
  })
  .default({})

export const appConfigSchema = z
  .object({
    system: systemConfigSchema,
    navigation: navigationConfigSchema,
  })
  .default({})

export type OpenTarget = z.infer<typeof openTargetSchema>
export type ServiceConfig = z.infer<typeof serviceConfigSchema>
export type ServiceGroupConfig = z.infer<typeof serviceGroupConfigSchema>
export type ServicesConfig = z.infer<typeof servicesConfigSchema>
export type Service = z.infer<typeof serviceSchema>
export type Services = z.infer<typeof servicesSchema>
export type QuickRecord = z.infer<typeof quickRecordSchema>
export type SceneGroupConfig = z.infer<typeof sceneGroupConfigSchema>
export type NavigationSceneConfig = z.infer<typeof navigationSceneConfigSchema>
export type NavigationConfig = z.infer<typeof navigationConfigSchema>
export type AuthConfig = z.infer<typeof authConfigSchema>
export type NetworkProbeConfig = z.infer<typeof networkProbeConfigSchema>
export type WebdavBackupConfig = z.infer<typeof webdavBackupConfigSchema>
export type SystemConfig = z.infer<typeof systemConfigSchema>
export type AppConfig = z.infer<typeof appConfigSchema>
