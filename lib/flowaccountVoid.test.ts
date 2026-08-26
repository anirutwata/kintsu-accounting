import { describe, expect, it } from 'vitest'
import { isFlowAccountDocumentVoided } from './flowaccountVoid'

describe('FlowAccount cleanup verification', () => {
  it('accepts only a confirmed void/delete response', () => {
    expect(isFlowAccountDocumentVoided({ statusString: 'Void' })).toBe(true)
    expect(isFlowAccountDocumentVoided({ isDelete: true })).toBe(true)
    expect(isFlowAccountDocumentVoided({ statusString: 'Approved', isDelete: false })).toBe(false)
    expect(isFlowAccountDocumentVoided(null)).toBe(false)
  })
})
