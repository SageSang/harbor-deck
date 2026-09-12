import { createHash, randomBytes } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { authUsernameSchema } from '../src/config/schema.js'
import {
  AuthConfigConflictError,
  commitAuthConfig,
  inspectAppConfig,
  readSystemConfig,
} from './configStore.js'
import { createPasswordAttemptLimiter, type PasswordAttemptResult } from './passwordAttempts.js'
import { createDeterministicPasswordHash, hashPassword, verifyPassword } from './password.js'

const SESSION_COOKIE_NAME = 'harbordeck_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7
const DUMMY_PASSWORD_HASH = createDeterministicPasswordHash(
  'harbordeck-dummy-password',
  'harbordeck-dummy-salt'
)

const passwordSchema = z.string().min(12).max(128)

const loginBodySchema = z.object({
  username: authUsernameSchema,
  password: passwordSchema,
})

const setupBodySchema = loginBodySchema

const updateCredentialsBodySchema = z.object({
  currentPassword: z.string().min(1).max(128),
  nextUsername: authUsernameSchema,
  nextPassword: passwordSchema,
})

interface SessionRecord {
  username: string
  authFingerprint: string
  expiresAt: number
}

type AuthConfig = NonNullable<Awaited<ReturnType<typeof readSystemConfig>>['auth']>

class AuthSessionExpiredError extends Error {}

function authFingerprint(auth: AuthConfig) {
  return sha256Base64Url(JSON.stringify([auth.username, auth.passwordHash]))
}

export interface AuthStatusResponse {
  setupRequired: boolean
  authenticated: boolean
  username?: string
}

function sha256Base64Url(value: string) {
  return createHash('sha256').update(value).digest('base64url')
}

function serializeCookie(
  name: string,
  value: string,
  options: { maxAge: number; secure: boolean }
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(options.maxAge / 1000))}`,
  ]

  if (options.secure) {
    parts.push('Secure')
  }

  return parts.join('; ')
}

function parseCookies(cookieHeader?: string) {
  return Object.fromEntries(
    (cookieHeader ?? '')
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separatorIndex = item.indexOf('=')
        if (separatorIndex < 0) {
          return [item, '']
        }

        return [item.slice(0, separatorIndex), decodeURIComponent(item.slice(separatorIndex + 1))]
      })
  )
}

export function createAuthService() {
  const sessions = new Map<string, SessionRecord>()
  const loginAttempts = createPasswordAttemptLimiter()

  function isSecureRequest(request: FastifyRequest) {
    return request.protocol === 'https'
  }

  function setNoStore(reply: FastifyReply) {
    reply.header('Cache-Control', 'no-store')
  }

  function setSessionCookie(
    reply: FastifyReply,
    request: FastifyRequest,
    token: string,
    maxAge: number
  ) {
    reply.header(
      'Set-Cookie',
      serializeCookie(SESSION_COOKIE_NAME, token, {
        maxAge,
        secure: isSecureRequest(request),
      })
    )
  }

  function clearSessionCookie(reply: FastifyReply, request: FastifyRequest) {
    reply.header(
      'Set-Cookie',
      serializeCookie(SESSION_COOKIE_NAME, '', {
        maxAge: 0,
        secure: isSecureRequest(request),
      })
    )
  }

  function pruneSessions() {
    const now = Date.now()
    sessions.forEach((session, key) => {
      if (session.expiresAt <= now) {
        sessions.delete(key)
      }
    })
  }

  function getSessionFromRequest(request: FastifyRequest) {
    pruneSessions()

    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE_NAME]
    if (!token) {
      return null
    }

    const session = sessions.get(sha256Base64Url(token))
    if (!session || session.expiresAt <= Date.now()) {
      sessions.delete(sha256Base64Url(token))
      return null
    }

    return {
      token,
      session,
    }
  }

  function getSessionKey(request: FastifyRequest) {
    const session = getSessionFromRequest(request)
    return session ? sha256Base64Url(session.token) : null
  }

  function prepareSession(auth: AuthConfig) {
    const token = randomBytes(32).toString('base64url')
    return {
      token,
      record: {
        username: auth.username,
        authFingerprint: authFingerprint(auth),
        expiresAt: Date.now() + SESSION_TTL_MS,
      },
    }
  }

  function installSession(prepared: ReturnType<typeof prepareSession>) {
    sessions.set(sha256Base64Url(prepared.token), prepared.record)
  }

  function isSessionCurrent(
    request: FastifyRequest,
    auth: AuthConfig | undefined,
    sessionKey?: string
  ) {
    const current = getSessionFromRequest(request)
    return Boolean(
      auth &&
      current &&
      current.session.authFingerprint === authFingerprint(auth) &&
      (!sessionKey || sha256Base64Url(current.token) === sessionKey)
    )
  }

  async function getConfiguredAuth() {
    const system = await readSystemConfig()
    return system.auth ?? null
  }

  async function getStatus(request: FastifyRequest): Promise<AuthStatusResponse> {
    const auth = await getConfiguredAuth()
    if (!auth) {
      return {
        setupRequired: true,
        authenticated: false,
      }
    }

    const session = getSessionFromRequest(request)
    if (!session || session.session.authFingerprint !== authFingerprint(auth)) {
      return {
        setupRequired: false,
        authenticated: false,
      }
    }

    return {
      setupRequired: false,
      authenticated: true,
      username: auth.username,
    }
  }

  async function requireAuthenticated(request: FastifyRequest, reply: FastifyReply) {
    const status = await getStatus(request)
    setNoStore(reply)

    if (status.setupRequired) {
      reply.code(428)
      await reply.send('请先创建管理员账号')
      return null
    }

    if (!status.authenticated || !status.username) {
      clearSessionCookie(reply, request)
      reply.code(401)
      await reply.send('请先登录')
      return null
    }

    return status
  }

  async function handleAuthStatus(request: FastifyRequest, reply: FastifyReply) {
    setNoStore(reply)
    return getStatus(request)
  }

  async function handleSetup(request: FastifyRequest, reply: FastifyReply) {
    setNoStore(reply)
    if (await getConfiguredAuth()) return reply.code(409).send('管理员账号已存在')
    const { username, password } = setupBodySchema.parse(request.body)
    const auth = { username, passwordHash: await hashPassword(password) }
    const prepared = prepareSession(auth)
    try {
      await commitAuthConfig({
        expectedAuth: null,
        auth,
        onCommitted() {
          sessions.clear()
          installSession(prepared)
        },
      })
    } catch (error) {
      if (error instanceof AuthConfigConflictError) return reply.code(409).send(error.message)
      throw error
    }
    setSessionCookie(reply, request, prepared.token, SESSION_TTL_MS)
    return { setupRequired: false, authenticated: true, username } satisfies AuthStatusResponse
  }

  async function handleLogin(request: FastifyRequest, reply: FastifyReply) {
    setNoStore(reply)
    const configuredAuth = await getConfiguredAuth()
    if (!configuredAuth) return reply.code(409).send('请先创建管理员账号')
    const { username, password } = loginBodySchema.parse(request.body)
    const attempt = loginAttempts.begin(request.ip)
    if (!attempt.finish) {
      reply.header('Retry-After', String(attempt.retryAfter))
      return reply.code(429).send('尝试过于频繁，请稍后再试')
    }
    let outcome: PasswordAttemptResult = 'cancelled'
    try {
      const usernameMatches = configuredAuth.username === username
      const passwordMatches = await verifyPassword(
        password,
        usernameMatches ? configuredAuth.passwordHash : DUMMY_PASSWORD_HASH
      )
      if (!usernameMatches || !passwordMatches) {
        outcome = 'failure'
        return reply.code(401).send('账号或密码错误')
      }
      const prepared = prepareSession(configuredAuth)
      const installed = await inspectAppConfig((current) => {
        if (
          !current.system.auth ||
          authFingerprint(current.system.auth) !== authFingerprint(configuredAuth)
        ) {
          return false
        }
        installSession(prepared)
        return true
      })
      if (!installed) return reply.code(409).send('认证状态已变化，请重新登录后重试')
      outcome = 'success'
      setSessionCookie(reply, request, prepared.token, SESSION_TTL_MS)
      return {
        setupRequired: false,
        authenticated: true,
        username: configuredAuth.username,
      } satisfies AuthStatusResponse
    } finally {
      attempt.finish(outcome)
    }
  }

  async function handleLogout(request: FastifyRequest, reply: FastifyReply) {
    setNoStore(reply)
    const session = getSessionFromRequest(request)
    if (session) {
      sessions.delete(sha256Base64Url(session.token))
    }
    clearSessionCookie(reply, request)
    return { ok: true }
  }

  async function handleUpdateCredentials(request: FastifyRequest, reply: FastifyReply) {
    const status = await requireAuthenticated(request, reply)
    if (!status) {
      return reply
    }

    const configuredAuth = await getConfiguredAuth()
    if (!configuredAuth) {
      reply.code(409)
      return reply.send('请先创建管理员账号')
    }

    const { currentPassword, nextUsername, nextPassword } = updateCredentialsBodySchema.parse(
      request.body
    )

    const currentPasswordMatches = await verifyPassword(
      currentPassword,
      configuredAuth.passwordHash
    )
    if (!currentPasswordMatches) {
      reply.code(401)
      return reply.send('当前密码不正确')
    }

    const sessionKey = getSessionKey(request)
    const nextAuth = { username: nextUsername, passwordHash: await hashPassword(nextPassword) }
    const prepared = prepareSession(nextAuth)
    try {
      await commitAuthConfig({
        expectedAuth: configuredAuth,
        auth: nextAuth,
        assertSessionValid() {
          if (!sessionKey || !isSessionCurrent(request, configuredAuth, sessionKey)) {
            throw new AuthSessionExpiredError('登录状态已失效，请重新登录')
          }
        },
        onCommitted() {
          sessions.clear()
          installSession(prepared)
        },
      })
    } catch (error) {
      if (error instanceof AuthConfigConflictError) return reply.code(409).send(error.message)
      if (error instanceof AuthSessionExpiredError) return reply.code(401).send(error.message)
      throw error
    }
    setSessionCookie(reply, request, prepared.token, SESSION_TTL_MS)

    return {
      setupRequired: false,
      authenticated: true,
      username: nextUsername,
    } satisfies AuthStatusResponse
  }

  return {
    getStatus,
    getSessionKey,
    isSessionCurrent,
    clearSessionCookie,
    requireAuthenticated,
    invalidateAllSessions(reply?: FastifyReply, request?: FastifyRequest) {
      sessions.clear()

      if (reply && request) {
        clearSessionCookie(reply, request)
      }
    },
    handleAuthStatus,
    handleSetup,
    handleLogin,
    handleLogout,
    handleUpdateCredentials,
  }
}
