import { beforeEach, describe, expect, it, vi } from 'vitest'
import { extractDocument } from '..'
import { AnthropicOcrProvider } from './anthropic'

const createMessage = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: createMessage }
  },
}))

describe('Anthropic OCR provider', () => {
  beforeEach(() => { createMessage.mockReset() })

  it('gives Claude the exact JSON schema so tax-invoice fallback passes validation', async () => {
    createMessage.mockImplementation(async ({ messages }) => {
      const prompt = messages[0].content.find((part: { type: string }) => part.type === 'text').text
      const hasRequiredSchema = prompt.includes('"subtotal_found"') && prompt.includes('"payment_method_found"')
      return {
        content: [{ type: 'text', text: JSON.stringify(hasRequiredSchema ? {
          date_found: true, date_day: 1, date_month: 9, date_year_ce: 2026,
          subtotal_found: true, subtotal_baht: 1268,
          total_found: true, total_baht: 1356,
          payment_method_found: true, payment_method: 'credit_card', confidence: 1,
        } : {
          restaurant_name: 'Kintsu Yakiniku', date_day: '01', date_month: '09', date_year_ce: '2026',
          subtotal_baht: 1268, total_baht: 1356, payment_method: 'credit_card',
        }) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }
    })

    const result = await extractDocument({
      profile: 'tax_invoice_bill',
      image: { bytes: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: 'image/jpeg' },
      providers: [new AnthropicOcrProvider('claude-sonnet-5', 'test-key')],
    })

    expect(result.data).toEqual({
      documentDate: '2026-09-01', subtotalBaht: 1268, totalBaht: 1356,
      paymentMethod: 'credit_card', confidence: 1,
    })
    expect(createMessage).toHaveBeenCalledWith(expect.objectContaining({ thinking: { type: 'disabled' } }))
  })
})
