import { OcrError, type OcrProvider, type ProviderResult } from '../types'
import { providerErrorCategory } from './errors'

export class GeminiOcrProvider implements OcrProvider {
  readonly name = 'gemini' as const

  constructor(readonly model: string, readonly fallbackLevel: number, private readonly apiKey: string) {}

  async extract(input: Parameters<OcrProvider['extract']>[0]): Promise<ProviderResult> {
    const startedAt = Date.now()
    try {
      const { GoogleGenAI } = await import('@google/genai')
      const ai = new GoogleGenAI({ apiKey: this.apiKey })
      const response = await ai.models.generateContent({
        model: this.model,
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { data: Buffer.from(input.image.bytes).toString('base64'), mimeType: input.image.mimeType } },
            { text: input.prompt },
          ],
        }],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: input.jsonSchema,
          maxOutputTokens: input.maxOutputTokens ?? 512,
          temperature: 0,
          httpOptions: { timeout: input.timeoutMs, retryOptions: { attempts: 1 } },
        },
      })
      const text = response.text
      if (!text) throw new OcrError('invalid_response', 'Gemini returned no JSON')
      let data: unknown
      try { data = JSON.parse(text) } catch { throw new OcrError('invalid_response', 'Gemini returned invalid JSON') }
      return {
        data,
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount ?? null,
          outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
        },
        latencyMs: Date.now() - startedAt,
      }
    } catch (error) {
      if (error instanceof OcrError) throw error
      if (providerErrorCategory(error) === 'timeout') throw new OcrError('timeout', 'Gemini request timed out')
      throw new OcrError('provider_error', 'Gemini request failed')
    }
  }
}
