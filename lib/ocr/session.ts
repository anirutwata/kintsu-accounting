import { createHmac, timingSafeEqual } from 'node:crypto'

const SESSION_VERSION = 'v1'

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function createOcrSessionToken(input: { actorId: string; role: string; expiresAt: number }, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ ...input, v: SESSION_VERSION })).toString('base64url')
  return `${payload}.${signature(payload, secret)}`
}

export function verifyOcrSessionToken(token: string | undefined, secret: string): { actorId: string; role: string } | null {
  if (!token) return null
  const [payload, suppliedSignature, extra] = token.split('.')
  if (!payload || !suppliedSignature || extra) return null
  const expected = signature(payload, secret)
  const actualBytes = Buffer.from(suppliedSignature)
  const expectedBytes = Buffer.from(expected)
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!decoded || typeof decoded !== 'object') return null
    const value = decoded as Record<string, unknown>
    if (value.v !== SESSION_VERSION || typeof value.actorId !== 'string' || !value.actorId ||
        typeof value.role !== 'string' || typeof value.expiresAt !== 'number' || value.expiresAt <= Date.now()) return null
    return { actorId: value.actorId, role: value.role }
  } catch { return null }
}
