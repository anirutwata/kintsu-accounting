import { afterEach, describe, expect, it, vi } from 'vitest'
import { FlowAccountError, createExpense, getExpenseDocument, isDefiniteRejection } from './flowaccount'

describe('token request failures are wrapped as notSent', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('network rejection and bad JSON both become definite (releasable) errors with no API call', async () => {
    for (const f of [
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json') } }),
    ]) {
      vi.stubGlobal('fetch', f)
      const err = (await getExpenseDocument(1).catch((e) => e)) as FlowAccountError
      expect(err).toBeInstanceOf(FlowAccountError)
      expect(err.notSent).toBe(true)
      expect(isDefiniteRejection(err)).toBe(true)
      expect(f).toHaveBeenCalledTimes(1) // token only, never the API
    }
  })
})

describe('FlowAccount error hardening', () => {
  afterEach(() => vi.unstubAllGlobals())
  const tokenOk = { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 3600 }) }

  it('token body null -> notSent FlowAccountError, not TypeError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => null }))
    const err = (await getExpenseDocument(1).catch((e) => e)) as FlowAccountError
    expect(err).toBeInstanceOf(FlowAccountError)
    expect(err.notSent).toBe(true)
  })

  it('HTML 404 is not fromApiJson; JSON 404 is', async () => {
    for (const [body, expected] of [['<html>nope</html>', false], ['{"status":false,"message":"gone"}', true]] as const) {
      vi.stubGlobal('fetch', vi.fn(async (_u: unknown, init?: RequestInit) =>
        init?.body instanceof URLSearchParams ? tokenOk : { ok: false, status: 404, statusText: 'Not Found', text: async () => body }))
      const err = (await getExpenseDocument(1).catch((e) => e)) as FlowAccountError
      expect(err.status).toBe(404)
      expect(err.fromApiJson).toBe(expected)
    }
  })

  it('empty-body 404 and JSON null/non-object 4xx -> FlowAccountError(status), not fromApiJson, no TypeError', async () => {
    for (const body of ['', 'null', '"x"', '[]']) {
      vi.stubGlobal('fetch', vi.fn(async (_u: unknown, init?: RequestInit) =>
        init?.body instanceof URLSearchParams ? tokenOk : { ok: false, status: 404, statusText: 'Not Found', text: async () => body }))
      const err = (await getExpenseDocument(1).catch((e) => e)) as FlowAccountError
      expect(err).toBeInstanceOf(FlowAccountError)
      expect(err.status).toBe(404)
      expect(err.fromApiJson).toBe(false)
      expect(isDefiniteRejection(err)).toBe(true)
    }
  })
})

describe('write retry policy', () => {
  afterEach(() => vi.unstubAllGlobals())
  const tokenOk = { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 3600 }) }
  const isToken = (init?: RequestInit) => init?.body instanceof URLSearchParams
  const apiCalls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter(([, i]) => !isToken(i as RequestInit)).length
  const tokenCalls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter(([, i]) => isToken(i as RequestInit)).length
  const resp = (status: number, body: string) => ({ ok: status < 400, status, statusText: 'x', text: async () => body })
  const post = () => createExpense({ items: [] } as never).catch((e) => e)

  it('POST does not retry on 5xx, network error, or unparseable body', async () => {
    for (const mk of [
      () => resp(502, '{"status":false,"message":"bad gateway"}'),
      () => { throw new TypeError('fetch failed') },
      () => resp(200, '<html>'),
    ]) {
      const f = vi.fn(async (_u: unknown, init?: RequestInit) => (isToken(init) ? tokenOk : mk()))
      vi.stubGlobal('fetch', f)
      await post()
      expect(apiCalls(f)).toBe(1)
    }
  })

  it('POST retries exactly once with a fresh token on a 400 and succeeds', async () => {
    let n = 0
    const f = vi.fn(async (_u: unknown, init?: RequestInit) => {
      if (isToken(init)) return tokenOk
      return ++n === 1 ? resp(400, '{"status":false,"data":false,"message":"stale"}') : resp(200, '{"status":true,"data":{"recordId":5}}')
    })
    vi.stubGlobal('fetch', f)
    expect(await createExpense({ items: [] } as never)).toEqual({ recordId: 5 })
    expect(apiCalls(f)).toBe(2)
    expect(tokenCalls(f)).toBeGreaterThanOrEqual(1) // refreshed (cache cleared) before the retry
  })

  it('POST gives up after one retry when 400 persists', async () => {
    const f = vi.fn(async (_u: unknown, init?: RequestInit) => (isToken(init) ? tokenOk : resp(400, '{"status":false,"message":"no"}')))
    vi.stubGlobal('fetch', f)
    const err = await post()
    expect(err).toBeInstanceOf(FlowAccountError)
    expect(apiCalls(f)).toBe(2)
  })

  it('GET still retries on a 5xx', async () => {
    let n = 0
    const f = vi.fn(async (_u: unknown, init?: RequestInit) => {
      if (isToken(init)) return tokenOk
      return ++n === 1 ? resp(502, '{"status":false}') : resp(200, '{"status":true,"data":{"a":1}}')
    })
    vi.stubGlobal('fetch', f)
    expect(await getExpenseDocument(1)).toEqual({ a: 1 })
    expect(apiCalls(f)).toBe(2)
  })
})
