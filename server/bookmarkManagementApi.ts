import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError, z } from 'zod'
import { httpUrlSchema, slugSchema, type NavigationConfig } from '../src/config/schema.js'
import { mutateNavigationConfig, previewNavigationConfig, readNavigationConfig } from './configStore.js'
import {
  bookmarkManagementTokenHeader,
  getBookmarkManagementTokenStatus,
  isBookmarkManagementTokenValid,
  readBookmarkManagementToken,
} from './bookmarkManagementAuth.js'
import {
  BookmarkManagementError,
  batchMoveManagedBookmarks,
  batchPlaceManagedBookmarks,
  batchRemoveManagedBookmarks,
  createManagedBookmark,
  createManagedGroup,
  createManagedQuickRecord,
  deleteManagedBookmark,
  deleteManagedGroup,
  deleteManagedQuickRecord,
  duplicateManagedBookmark,
  fillMissingManagedIcons,
  getBookmarkPlacements,
  getManagementCounts,
  getNavigationRevision,
  listManagedIcons,
  promoteManagedQuickRecord,
  removeManagedPlacement,
  renameManagedGroup,
  reorderManagedBookmarks,
  reorderManagedGroups,
  searchManagedNavigation,
  setManagedPlacement,
  toManagedState,
  updateManagedBookmark,
  updateManagedQuickRecord,
  type ManagedPlacement,
} from './bookmarkManagementService.js'

const MANAGEMENT_PREFIX = '/api/management/v1'
const READ_LIMIT_PER_MINUTE = 120
const WRITE_LIMIT_PER_MINUTE = 30
const RATE_WINDOW_MS = 60_000
const MAX_BATCH_SIZE = 100
const MANAGEMENT_BODY_LIMIT = 1024 * 1024

const nonEmptyIdSchema = z.string().trim().min(1).max(200)
const nameSchema = z.string().trim().min(1).max(200)
const nullableNoteSchema = z.string().max(5000).nullable().optional()
const nullableIconSchema = z.string().trim().min(1).nullable().optional()
const nullableUrlSchema = httpUrlSchema.nullable().optional()
const nullableProbesSchema = z.array(httpUrlSchema).min(1).max(100).nullable().optional()
const positionSchema = z.number().int().min(0)

const sceneParamsSchema = z.object({ sceneId: slugSchema })
const groupParamsSchema = z.object({ sceneId: slugSchema, groupId: slugSchema })
const bookmarkParamsSchema = z.object({ slug: slugSchema })
const sceneBookmarkParamsSchema = z.object({ sceneId: slugSchema, slug: slugSchema })
const quickRecordParamsSchema = z.object({ sceneId: slugSchema, recordId: nonEmptyIdSchema })
const placementSchema = z
  .object({
    sceneId: slugSchema,
    groupId: slugSchema,
    position: positionSchema.optional(),
  })
  .strict()

const groupCreateSchema = z
  .object({ id: slugSchema.optional(), name: nameSchema, position: positionSchema.optional() })
  .strict()
const groupPatchSchema = z.object({ name: nameSchema }).strict()
const groupOrderSchema = z
  .object({ groupIds: z.array(slugSchema).max(10_000) })
  .strict()
const groupDeleteQuerySchema = z
  .object({
    bookmarkDisposition: z.enum(['reject', 'remove', 'move']).default('reject'),
    targetGroupId: slugSchema.optional(),
    targetPosition: z.coerce.number().int().min(0).optional(),
  })
  .strict()

const bookmarkCreateSchema = z
  .object({
    slug: slugSchema.optional(),
    name: nameSchema,
    note: nullableNoteSchema,
    icon: nullableIconSchema,
    primaryUrl: httpUrlSchema,
    secondaryUrl: nullableUrlSchema,
    probes: nullableProbesSchema,
    forceNewTab: z.boolean().optional(),
    placements: z.array(placementSchema).min(1).max(MAX_BATCH_SIZE),
  })
  .strict()
const bookmarkPatchSchema = z
  .object({
    slug: slugSchema.optional(),
    name: nameSchema.optional(),
    note: nullableNoteSchema,
    icon: nullableIconSchema,
    primaryUrl: httpUrlSchema.optional(),
    secondaryUrl: nullableUrlSchema,
    probes: nullableProbesSchema,
    forceNewTab: z.boolean().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少提供一个要修改的字段')
const duplicateBookmarkSchema = z
  .object({
    slug: slugSchema.optional(),
    name: nameSchema.optional(),
    placements: z.array(placementSchema).min(1).max(MAX_BATCH_SIZE).optional(),
  })
  .strict()
  .default({})
const placementBodySchema = z
  .object({ groupId: slugSchema, position: positionSchema.optional() })
  .strict()
const orphanQuerySchema = z
  .object({ orphanPolicy: z.enum(['reject', 'delete']).default('reject') })
  .strict()
const batchMoveSchema = z
  .object({
    bookmarkIds: z.array(slugSchema).min(1).max(MAX_BATCH_SIZE),
    targetGroupId: slugSchema,
    position: positionSchema.optional(),
  })
  .strict()
const batchPlaceSchema = z
  .object({
    bookmarkIds: z.array(slugSchema).min(1).max(MAX_BATCH_SIZE),
    placements: z.array(placementSchema.omit({ position: true })).min(1).max(MAX_BATCH_SIZE),
    conflictPolicy: z.enum(['move', 'skip', 'reject']),
  })
  .strict()
const batchRemoveSchema = z
  .object({
    bookmarkIds: z.array(slugSchema).min(1).max(MAX_BATCH_SIZE),
    orphanPolicy: z.enum(['reject', 'delete']),
  })
  .strict()
const bookmarkOrderSchema = z
  .object({ bookmarkIds: z.array(slugSchema).max(100_000) })
  .strict()

const quickRecordCreateSchema = z
  .object({
    name: nameSchema,
    note: nullableNoteSchema,
    icon: nullableIconSchema,
    primaryUrl: httpUrlSchema,
    secondaryUrl: nullableUrlSchema,
  })
  .strict()
const quickRecordPatchSchema = z
  .object({
    name: nameSchema.optional(),
    note: nullableNoteSchema,
    icon: nullableIconSchema,
    primaryUrl: httpUrlSchema.optional(),
    secondaryUrl: nullableUrlSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少提供一个要修改的字段')
const promoteQuickRecordSchema = z
  .object({
    slug: slugSchema.optional(),
    placements: z.array(placementSchema).min(1).max(MAX_BATCH_SIZE),
    reuseExistingByUrl: z.boolean().default(true),
  })
  .strict()
const fillMissingIconsSchema = z
  .object({ sceneIds: z.array(slugSchema).min(1).max(MAX_BATCH_SIZE).optional() })
  .strict()
  .default({})
const searchQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(200),
    sceneId: z.union([slugSchema, z.literal('all')]).default('all'),
    type: z.enum(['bookmark', 'quick-record', 'all']).default('all'),
  })
  .strict()
const iconQuerySchema = z
  .object({
    q: z.string().trim().max(100).default(''),
    limit: z.coerce.number().int().min(1).max(500).default(50),
  })
  .strict()

interface RateRecord {
  windowStartedAt: number
  reads: number
  writes: number
}

type ManagementMutation<TResult> = (navigation: NavigationConfig) => {
  navigation: NavigationConfig
  result: TResult
}

function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string
) {
  return reply.code(statusCode).send({
    ok: false,
    error: { code, message, requestId: request.id },
  })
}

function etag(revision: string) {
  return `"${revision}"`
}

function readSingleHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function normalizeIfMatch(value: string) {
  return value.trim().replace(/^W\//, '').replace(/^"|"$/g, '')
}

function parseRouteValue<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown
): z.output<TSchema> {
  try {
    return schema.parse(value)
  } catch (cause) {
    if (cause instanceof ZodError) {
      throw new BookmarkManagementError(
        400,
        'INVALID_REQUEST',
        cause.issues[0]?.message ?? '请求参数无效'
      )
    }
    throw cause
  }
}

function isDryRun(request: FastifyRequest) {
  const header = readSingleHeader(request.headers['x-harbordeck-dry-run'])?.toLowerCase()
  if (header === undefined || header === 'false') return false
  if (header === 'true') return true
  throw new BookmarkManagementError(
    400,
    'INVALID_DRY_RUN_HEADER',
    'X-HarborDeck-Dry-Run 只接受 true 或 false'
  )
}

function summarizeChanges(before: NavigationConfig, after: NavigationConfig) {
  const beforeCounts = getManagementCounts(before)
  const afterCounts = getManagementCounts(after)
  return {
    groups: afterCounts.groups - beforeCounts.groups,
    bookmarks: afterCounts.bookmarks - beforeCounts.bookmarks,
    quickRecords: afterCounts.quickRecords - beforeCounts.quickRecords,
  }
}

async function executeWrite<TResult>(
  request: FastifyRequest,
  reply: FastifyReply,
  mutation: ManagementMutation<TResult>,
  created = false
) {
  const suppliedRevision = readSingleHeader(request.headers['if-match'])
  if (!suppliedRevision) {
    return sendError(request, reply, 428, 'IF_MATCH_REQUIRED', '写请求必须携带 If-Match')
  }
  const expectedRevision = normalizeIfMatch(suppliedRevision)
  if (!/^sha256:[a-f0-9]{64}$/.test(expectedRevision)) {
    return sendError(request, reply, 400, 'INVALID_IF_MATCH', 'If-Match 必须是有效的 SHA-256 revision')
  }
  const dryRun = isDryRun(request)

  try {
    let baseNavigation: NavigationConfig | null = null
    const execute = dryRun ? previewNavigationConfig : mutateNavigationConfig
    const output = await execute((current) => {
      const currentRevision = getNavigationRevision(current)
      if (currentRevision !== expectedRevision) {
        throw new BookmarkManagementError(412, 'REVISION_MISMATCH', '状态已变化，请重新读取后再修改')
      }
      baseNavigation = current
      return mutation(current)
    })
    const revision = getNavigationRevision(output.navigation)
    reply.header('ETag', etag(revision))

    if (dryRun) {
      return reply.send({
        ok: true,
        committed: false,
        baseRevision: expectedRevision,
        proposedRevision: revision,
        result: {
          ...output.result,
          summary: summarizeChanges(baseNavigation!, output.navigation),
        },
      })
    }

    return reply.code(created ? 201 : 200).send({ ok: true, revision, result: output.result })
  } catch (cause) {
    if (cause instanceof BookmarkManagementError) {
      return sendError(request, reply, cause.statusCode, cause.code, cause.message)
    }
    if (cause instanceof ZodError) {
      return sendError(
        request,
        reply,
        422,
        'INVALID_NAVIGATION_STATE',
        cause.issues[0]?.message ?? '导航状态无效'
      )
    }
    request.log.error(cause)
    return sendError(request, reply, 500, 'INTERNAL_ERROR', '服务器内部错误')
  }
}

export async function registerBookmarkManagementApi(app: FastifyInstance) {
  const rateRecords = new Map<string, RateRecord>()

  await app.register(async (management) => {
    management.addHook('onSend', async (_request, reply, payload) => {
      reply.header('Cache-Control', 'no-store')
      reply.header('Pragma', 'no-cache')
      reply.header('Vary', 'X-HarborDeck-Management-Token')
      return payload
    })

    management.addHook('preHandler', async (request, reply) => {
      const status = getBookmarkManagementTokenStatus()
      if (!status.configured) {
        const message = status.invalidLength
          ? 'HARBORDECK_BOOKMARK_MANAGEMENT_TOKEN must contain at least 32 characters'
          : 'HARBORDECK_BOOKMARK_MANAGEMENT_TOKEN is not configured'
        return sendError(request, reply, 503, 'MANAGEMENT_API_DISABLED', message)
      }

      const token = readBookmarkManagementToken(request)
      if (!isBookmarkManagementTokenValid(token)) {
        return sendError(request, reply, 401, 'INVALID_MANAGEMENT_TOKEN', '管理 Token 缺失或错误')
      }

      const now = Date.now()
      const tokenDigest = createHash('sha256').update(String(token)).digest('base64url')
      const key = `${request.socket.remoteAddress ?? 'unknown'}:${tokenDigest}`
      let record = rateRecords.get(key)
      if (!record || record.windowStartedAt + RATE_WINDOW_MS <= now) {
        if (!record && rateRecords.size >= 10_000) {
          const oldestKey = rateRecords.keys().next().value
          if (oldestKey) rateRecords.delete(oldestKey)
        }
        record = { windowStartedAt: now, reads: 0, writes: 0 }
        rateRecords.set(key, record)
      }
      const isRead = request.method === 'GET' || request.method === 'HEAD'
      const current = isRead ? record.reads : record.writes
      const limit = isRead ? READ_LIMIT_PER_MINUTE : WRITE_LIMIT_PER_MINUTE
      if (current >= limit) {
        reply.header('Retry-After', String(Math.max(1, Math.ceil((record.windowStartedAt + RATE_WINDOW_MS - now) / 1000))))
        return sendError(request, reply, 429, 'RATE_LIMITED', '请求过于频繁，请稍后重试')
      }
      if (isRead) record.reads += 1
      else record.writes += 1
    })

    management.setErrorHandler((cause, request, reply) => {
      if (cause instanceof BookmarkManagementError) {
        return sendError(request, reply, cause.statusCode, cause.code, cause.message)
      }
      if (cause instanceof ZodError) {
        return sendError(
          request,
          reply,
          422,
          'INVALID_REQUEST',
          cause.issues[0]?.message ?? '请求参数无效'
        )
      }
      const statusCode =
        typeof cause === 'object' &&
        cause !== null &&
        'statusCode' in cause &&
        typeof cause.statusCode === 'number'
          ? cause.statusCode
          : 500
      if (statusCode === 400 || statusCode === 413) {
        return sendError(
          request,
          reply,
          statusCode,
          statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON',
          statusCode === 413 ? '请求体不能超过 1 MiB' : 'JSON 请求体无效'
        )
      }
      request.log.error(cause)
      return sendError(request, reply, 500, 'INTERNAL_ERROR', '服务器内部错误')
    })

    management.get(`${MANAGEMENT_PREFIX}/status`, async (_request, reply) => {
      const navigation = await readNavigationConfig()
      const revision = getNavigationRevision(navigation)
      reply.header('ETag', etag(revision))
      return { ok: true, apiVersion: 1, revision, counts: getManagementCounts(navigation) }
    })

    management.get(`${MANAGEMENT_PREFIX}/state`, async (_request, reply) => {
      const navigation = await readNavigationConfig()
      const revision = getNavigationRevision(navigation)
      reply.header('ETag', etag(revision))
      return { revision, ...toManagedState(navigation) }
    })

    management.get(`${MANAGEMENT_PREFIX}/search`, async (request, reply) => {
      const query = parseRouteValue(searchQuerySchema, request.query)
      const navigation = await readNavigationConfig()
      const revision = getNavigationRevision(navigation)
      reply.header('ETag', etag(revision))
      return {
        revision,
        query: query.q,
        sceneId: query.sceneId,
        type: query.type,
        items: searchManagedNavigation(navigation, query.q, query.sceneId, query.type),
      }
    })

    management.get(`${MANAGEMENT_PREFIX}/icons`, async (request) => {
      const query = parseRouteValue(iconQuerySchema, request.query)
      return { items: listManagedIcons(query.q, query.limit) }
    })

    management.get(`${MANAGEMENT_PREFIX}/bookmarks/:slug`, async (request, reply) => {
      const { slug } = parseRouteValue(bookmarkParamsSchema, request.params)
      const navigation = await readNavigationConfig()
      const bookmark = navigation.bookmarks.find((item) => item.slug === slug)
      if (!bookmark) {
        return sendError(request, reply, 404, 'BOOKMARK_NOT_FOUND', '指定书签不存在')
      }
      const revision = getNavigationRevision(navigation)
      reply.header('ETag', etag(revision))
      return { revision, bookmark: { ...bookmark, placements: getBookmarkPlacements(navigation, slug) } }
    })

    management.post(
      `${MANAGEMENT_PREFIX}/scenes/:sceneId/groups`,
      { bodyLimit: MANAGEMENT_BODY_LIMIT },
      async (request, reply) => {
        const { sceneId } = parseRouteValue(sceneParamsSchema, request.params)
        const body = groupCreateSchema.parse(request.body)
        return executeWrite(request, reply, (navigation) => createManagedGroup(navigation, sceneId, body), true)
      }
    )

    management.patch(
      `${MANAGEMENT_PREFIX}/scenes/:sceneId/groups/:groupId`,
      { bodyLimit: MANAGEMENT_BODY_LIMIT },
      async (request, reply) => {
        const { sceneId, groupId } = parseRouteValue(groupParamsSchema, request.params)
        const { name } = groupPatchSchema.parse(request.body)
        return executeWrite(request, reply, (navigation) => renameManagedGroup(navigation, sceneId, groupId, name))
      }
    )

    management.put(
      `${MANAGEMENT_PREFIX}/scenes/:sceneId/groups/order`,
      { bodyLimit: MANAGEMENT_BODY_LIMIT },
      async (request, reply) => {
        const { sceneId } = parseRouteValue(sceneParamsSchema, request.params)
        const { groupIds } = groupOrderSchema.parse(request.body)
        return executeWrite(request, reply, (navigation) => reorderManagedGroups(navigation, sceneId, groupIds))
      }
    )

    management.delete(`${MANAGEMENT_PREFIX}/scenes/:sceneId/groups/:groupId`, async (request, reply) => {
      const { sceneId, groupId } = parseRouteValue(groupParamsSchema, request.params)
      const query = parseRouteValue(groupDeleteQuerySchema, request.query)
      return executeWrite(request, reply, (navigation) => deleteManagedGroup(navigation, sceneId, groupId, query))
    })

    management.post(
      `${MANAGEMENT_PREFIX}/bookmarks`,
      { bodyLimit: MANAGEMENT_BODY_LIMIT },
      async (request, reply) => {
        const body = bookmarkCreateSchema.parse(request.body)
        return executeWrite(request, reply, (navigation) => createManagedBookmark(navigation, body), true)
      }
    )

    management.patch(
      `${MANAGEMENT_PREFIX}/bookmarks/:slug`,
      { bodyLimit: MANAGEMENT_BODY_LIMIT },
      async (request, reply) => {
        const { slug } = parseRouteValue(bookmarkParamsSchema, request.params)
        const body = bookmarkPatchSchema.parse(request.body)
        return executeWrite(request, reply, (navigation) => updateManagedBookmark(navigation, slug, body))
      }
    )

    management.post(
      `${MANAGEMENT_PREFIX}/bookmarks/:slug/duplicate`,
      { bodyLimit: MANAGEMENT_BODY_LIMIT },
      async (request, reply) => {
        const { slug } = parseRouteValue(bookmarkParamsSchema, request.params)
        const body = duplicateBookmarkSchema.parse(request.body ?? {})
        return executeWrite(request, reply, (navigation) => duplicateManagedBookmark(navigation, slug, body), true)
      }
    )

    management.delete(`${MANAGEMENT_PREFIX}/bookmarks/:slug`, async (request, reply) => {
      const { slug } = parseRouteValue(bookmarkParamsSchema, request.params)
      return executeWrite(request, reply, (navigation) => deleteManagedBookmark(navigation, slug))
    })

    management.put(
      `${MANAGEMENT_PREFIX}/scenes/:sceneId/bookmarks/:slug/placement`,
      { bodyLimit: MANAGEMENT_BODY_LIMIT },
      async (request, reply) => {
        const { sceneId, slug } = parseRouteValue(sceneBookmarkParamsSchema, request.params)
        const body = placementBodySchema.parse(request.body)
        return executeWrite(request, reply, (navigation) => setManagedPlacement(navigation, sceneId, slug, body))
      }
    )

    management.delete(
      `${MANAGEMENT_PREFIX}/scenes/:sceneId/bookmarks/:slug/placement`,
      async (request, reply) => {
        const { sceneId, slug } = parseRouteValue(sceneBookmarkParamsSchema, request.params)
        const { orphanPolicy } = parseRouteValue(orphanQuerySchema, request.query)
        return executeWrite(request, reply, (navigation) => removeManagedPlacement(navigation, sceneId, slug, orphanPolicy))
      }
    )

    management.post(
      `${MANAGEMENT_PREFIX}/scenes/:sceneId/bookmarks/batch-move`,
      { bodyLimit: MANAGEMENT_BODY_LIMIT },
      async (request, reply) => {
        const { sceneId } = parseRouteValue(sceneParamsSchema, request.params)
        const body = batchMoveSchema.parse(request.body)
        return executeWrite(request, reply, (navigation) =>
          batchMoveManagedBookmarks(navigation, sceneId, body.bookmarkIds, body.targetGroupId, body.position)
        )
      }
    )

    management.post(
      `${MANAGEMENT_PREFIX}/bookmarks/batch-place`,
      { bodyLimit: MANAGEMENT_BODY_LIMIT },
      async (request, reply) => {
        const body = batchPlaceSchema.parse(request.body)
        return executeWrite(request, reply, (navigation) =>
          batchPlaceManagedBookmarks(
            navigation,
            body.bookmarkIds,
            body.placements as ManagedPlacement[],
            body.conflictPolicy
          )
        )
      }
    )

    management.post(
      `${MANAGEMENT_PREFIX}/scenes/:sceneId/bookmarks/batch-remove`,
      { bodyLimit: MANAGEMENT_BODY_LIMIT },
      async (request, reply) => {
        const { sceneId } = parseRouteValue(sceneParamsSchema, request.params)
        const body = batchRemoveSchema.parse(request.body)
        return executeWrite(request, reply, (navigation) =>
          batchRemoveManagedBookmarks(navigation, sceneId, body.bookmarkIds, body.orphanPolicy)
        )
      }
    )

    management.put(
      `${MANAGEMENT_PREFIX}/scenes/:sceneId/groups/:groupId/bookmarks/order`,
      { bodyLimit: MANAGEMENT_BODY_LIMIT },
      async (request, reply) => {
        const { sceneId, groupId } = parseRouteValue(groupParamsSchema, request.params)
        const { bookmarkIds } = bookmarkOrderSchema.parse(request.body)
        return executeWrite(request, reply, (navigation) =>
          reorderManagedBookmarks(navigation, sceneId, groupId, bookmarkIds)
        )
      }
    )

    management.post(
      `${MANAGEMENT_PREFIX}/scenes/:sceneId/quick-records`,
      { bodyLimit: MANAGEMENT_BODY_LIMIT },
      async (request, reply) => {
        const { sceneId } = parseRouteValue(sceneParamsSchema, request.params)
        const body = quickRecordCreateSchema.parse(request.body)
        return executeWrite(request, reply, (navigation) => createManagedQuickRecord(navigation, sceneId, body), true)
      }
    )

    management.patch(
      `${MANAGEMENT_PREFIX}/scenes/:sceneId/quick-records/:recordId`,
      { bodyLimit: MANAGEMENT_BODY_LIMIT },
      async (request, reply) => {
        const { sceneId, recordId } = parseRouteValue(quickRecordParamsSchema, request.params)
        const body = quickRecordPatchSchema.parse(request.body)
        return executeWrite(request, reply, (navigation) =>
          updateManagedQuickRecord(navigation, sceneId, recordId, body)
        )
      }
    )

    management.delete(
      `${MANAGEMENT_PREFIX}/scenes/:sceneId/quick-records/:recordId`,
      async (request, reply) => {
        const { sceneId, recordId } = parseRouteValue(quickRecordParamsSchema, request.params)
        return executeWrite(request, reply, (navigation) =>
          deleteManagedQuickRecord(navigation, sceneId, recordId)
        )
      }
    )

    management.post(
      `${MANAGEMENT_PREFIX}/scenes/:sceneId/quick-records/:recordId/promote`,
      { bodyLimit: MANAGEMENT_BODY_LIMIT },
      async (request, reply) => {
        const { sceneId, recordId } = parseRouteValue(quickRecordParamsSchema, request.params)
        const body = promoteQuickRecordSchema.parse(request.body)
        return executeWrite(request, reply, (navigation) =>
          promoteManagedQuickRecord(navigation, sceneId, recordId, body)
        )
      }
    )

    management.post(
      `${MANAGEMENT_PREFIX}/icons/fill-missing`,
      { bodyLimit: MANAGEMENT_BODY_LIMIT },
      async (request, reply) => {
        const { sceneIds } = fillMissingIconsSchema.parse(request.body ?? {})
        return executeWrite(request, reply, (navigation) => fillMissingManagedIcons(navigation, sceneIds))
      }
    )
  })
}

export { bookmarkManagementTokenHeader }
