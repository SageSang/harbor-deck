import { createHash, timingSafeEqual } from 'node:crypto'
import type { FastifyRequest } from 'fastify'

export const bookmarkManagementTokenHeader = 'x-harbordeck-management-token'
export const minimumBookmarkManagementTokenLength = 32

function configuredToken() {
  return process.env.HARBORDECK_BOOKMARK_MANAGEMENT_TOKEN?.trim() ?? ''
}
export function getBookmarkManagementTokenStatus() {
  const token = configuredToken()
  return {
    configured: token.length >= minimumBookmarkManagementTokenLength,
    invalidLength: token.length > 0 && token.length < minimumBookmarkManagementTokenLength,
  }
}

export function readBookmarkManagementToken(request: FastifyRequest) {
  const value = request.headers[bookmarkManagementTokenHeader]
  return Array.isArray(value) ? value[0] : value
}

export function isBookmarkManagementTokenValid(suppliedToken: unknown) {
  const expected = configuredToken()
  if (
    expected.length < minimumBookmarkManagementTokenLength ||
    typeof suppliedToken !== 'string' ||
    suppliedToken.length === 0
  ) {
    return false
  }

  const expectedDigest = createHash('sha256').update(expected).digest()
  const suppliedDigest = createHash('sha256').update(suppliedToken).digest()
  return timingSafeEqual(expectedDigest, suppliedDigest)
}
