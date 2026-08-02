import { createHash, randomBytes } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { authUsernameSchema } from '../src/config/schema.js'
import { readSystemConfig, writeSystemConfig } from './configStore.js'
import { createDeterministicPasswordHash, hashPassword, verifyPassword } from './password.js'

const SESSION_COOKIE_NAME = 'harbordeck_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7
const LOGIN_ATTEMPT_WINDOW_MS = 1000 * 60 * 10
const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_BLOCK_MS = 1000 * 60 * 30
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
  expiresAt: number
}

interface LoginAttemptRecord {
  count: number
  firstAttemptAt: number
  blockedUntil?: number
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
  const loginAttempts = new Map<string, LoginAttemptRecord>()

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

  function pruneLoginAttempts() {
    const now = Date.now()
    loginAttempts.forEach((record, key) => {
      if (record.blockedUntil && record.blockedUntil > now) {
        return
      }

      if (record.firstAttemptAt + LOGIN_ATTEMPT_WINDOW_MS <= now) {
        loginAttempts.delete(key)
      }
    })
  }

  function getAttemptKey(request: FastifyRequest, username: string) {
    return `${request.ip}:${username.trim().toLowerCase()}`
  }

  function ensureNotRateLimited(request: FastifyRequest, reply: FastifyReply, username: string) {
    pruneLoginAttempts()
    const record = loginAttempts.get(getAttemptKey(request, username))
    const now = Date.now()

    if (record?.blockedUntil && record.blockedUntil > now) {
      setNoStore(reply)
      reply.code(429)
      return reply.send('尝试过于频繁，请稍后再试')
    }

    return null
  }

  function registerLoginFailure(request: FastifyRequest, username: string) {
    const now = Date.now()
    const key = getAttemptKey(request, username)
    const current = loginAttempts.get(key)

    if (!current || current.firstAttemptAt + LOGIN_ATTEMPT_WINDOW_MS <= now) {
      loginAttempts.set(key, {
        count: 1,
        firstAttemptAt: now,
      })
      return
    }

    const nextCount = current.count + 1
    loginAttempts.set(key, {
      count: nextCount,
      firstAttemptAt: current.firstAttemptAt,
      blockedUntil: nextCount >= LOGIN_MAX_ATTEMPTS ? now + LOGIN_BLOCK_MS : current.blockedUntil,
    })
  }

  function clearLoginFailures(request: FastifyRequest, username: string) {
    loginAttempts.delete(getAttemptKey(request, username))
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

  function createSession(reply: FastifyReply, request: FastifyRequest, username: string) {
    const token = randomBytes(32).toString('base64url')
    sessions.set(sha256Base64Url(token), {
      username,
      expiresAt: Date.now() + SESSION_TTL_MS,
    })
    setSessionCookie(reply, request, token, SESSION_TTL_MS)
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
    if (!session || session.session.username !== auth.username) {
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
    const existingAuth = await getConfiguredAuth()
    if (existingAuth) {
      reply.code(409)
      return reply.send('管理员账号已存在')
    }

    const { username, password } = setupBodySchema.parse(request.body)
    const system = await readSystemConfig()
    const passwordHash = await hashPassword(password)
    const nextSystem = {
      ...system,
      auth: {
        username,
        passwordHash,
      },
    }

    await writeSystemConfig(nextSystem)
    createSession(reply, request, username)
    return {
      setupRequired: false,
      authenticated: true,
      username,
    } satisfies AuthStatusResponse
  }

  async function handleLogin(request: FastifyRequest, reply: FastifyReply) {
    setNoStore(reply)
    const configuredAuth = await getConfiguredAuth()
    if (!configuredAuth) {
      reply.code(409)
      return reply.send('请先创建管理员账号')
    }

    const { username, password } = loginBodySchema.parse(request.body)
    const limitedReply = ensureNotRateLimited(request, reply, username)
    if (limitedReply) {
      return limitedReply
    }

    const usernameMatches = configuredAuth.username === username
    const passwordMatches = usernameMatches
      ? await verifyPassword(password, configuredAuth.passwordHash)
      : await verifyPassword(password, DUMMY_PASSWORD_HASH)

    if (!usernameMatches || !passwordMatches) {
      registerLoginFailure(request, username)
      reply.code(401)
      return reply.send('账号或密码错误')
    }

    clearLoginFailures(request, username)
    createSession(reply, request, configuredAuth.username)

    return {
      setupRequired: false,
      authenticated: true,
      username: configuredAuth.username,
    } satisfies AuthStatusResponse
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

    const system = await readSystemConfig()
    const nextSystem = {
      ...system,
      auth: {
        username: nextUsername,
        passwordHash: await hashPassword(nextPassword),
      },
    }

    await writeSystemConfig(nextSystem)
    sessions.clear()
    createSession(reply, request, nextUsername)

    return {
      setupRequired: false,
      authenticated: true,
      username: nextUsername,
    } satisfies AuthStatusResponse
  }

  return {
    getStatus,
    getSessionKey,
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
