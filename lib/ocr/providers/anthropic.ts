import { OcrError, type OcrProvider, type ProviderResult } from '../types'
import { providerErrorCategory } from './errors'

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(trimmed) } catch { throw new OcrError('invalid_response', 'Anthropic returned invalid JSON') }
}

export class AnthropicOcrProvider implements OcrProvider {
  readonly name = 'anthropic' as const
  readonly fallbackLevel = 2

  constructor(readonly model: string, private readonly apiKey: string) {}

  async extract(input: Parameters<OcrProvider['extract']>[0]): Promise<ProviderResult> {
    const startedAt = Date.now()
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey: this.apiKey, timeout: input.timeoutMs, maxRetries: 0 })
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 512,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: input.image.mimeType, data: Buffer.from(input.image.bytes).toString('base64') } },
          { type: 'text', text: `${input.prompt}\nตอบเป็น JSON object เท่านั้น ไม่มี markdown` },
        ] }],
      })
      const text = response.content.filter(part => part.type === 'text').map(part => part.text).join('\n').trim()
      if (!text) throw new OcrError('invalid_response', 'Anthropic returned no JSON')
      const data = parseJsonObject(text)
      return {
        data,
        usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
        latencyMs: Date.now() - startedAt,
      }
    } catch (error) {
      if (error instanceof OcrError) throw error
      if (providerErrorCategory(error) === 'timeout') throw new OcrError('timeout', 'Anthropic request timed out')
      throw new OcrError('provider_error', 'Anthropic request failed')
    }
  }
}
