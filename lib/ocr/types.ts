export type OcrProfileName = 'thai_transfer_slip' | 'tax_invoice_bill' | 'expense_bill'

export type OcrProviderName = 'gemini' | 'anthropic'

export type OcrErrorCategory =
  | 'configuration'
  | 'provider_error'
  | 'timeout'
  | 'invalid_response'
  | 'validation_failure'

export interface OcrImage {
  bytes: Uint8Array
  mimeType: SupportedImageMimeType
}

export type SupportedImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp'

export interface SlipOcrData {
  amount_satang: number
  date: string
  time: string
  ref_number: string
  sender_name: string
  sender_bank: string
  sender_account: string
  recipient: string
  recipient_bank: string
  confidence: number
}

export interface TaxInvoiceBillOcrData {
  documentDate: string | null
  subtotalBaht: number | null
  totalBaht: number | null
  paymentMethod: 'cash' | 'transfer' | 'credit_card' | null
  confidence: number
}

export interface ExpenseBillItemOcrData {
  description: string
  quantity: number
  unit: string
  pricePerUnit: number
  suggestedCategory: string | null
}

export interface ExpenseBillOcrData {
  hasVat: boolean
  vatSatang: number
  vatInclusive: boolean
  hasWht: boolean
  whtSatang: number
  hasDiscount: boolean
  discountSatang: number
  totalSatang: number | null
  items: ExpenseBillItemOcrData[]
  vendor: { name: string; address: string; taxId: string; branch: string }
  confidence: number
}

export interface OcrDataByProfile {
  thai_transfer_slip: SlipOcrData
  tax_invoice_bill: TaxInvoiceBillOcrData
  expense_bill: ExpenseBillOcrData
}

export interface ProviderUsage {
  inputTokens: number | null
  outputTokens: number | null
}

export interface ProviderResult {
  data: unknown
  usage: ProviderUsage
  latencyMs: number
}

export interface OcrProvider {
  readonly name: OcrProviderName
  readonly model: string
  readonly fallbackLevel: number
  extract(input: {
    image: OcrImage
    prompt: string
    jsonSchema: Record<string, unknown>
    timeoutMs: number
    maxOutputTokens?: number
  }): Promise<ProviderResult>
}

export interface OcrAttemptMetadata {
  provider: OcrProviderName
  model: string
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
  fallbackLevel: number
  validationIssueCodes: string[]
  success: boolean
  errorCategory: OcrErrorCategory | null
}

export interface OcrResult<TData = SlipOcrData> {
  data: TData
  metadata: OcrAttemptMetadata
  cached: boolean
  hash: string
}

export interface CachedOcrResult<TData = unknown> {
  data: TData
  metadata: OcrAttemptMetadata
}

export interface OcrCache {
  get(cacheKey: string): Promise<CachedOcrResult | null>
  save(cacheKey: string, result: CachedOcrResult): Promise<void>
}

export interface OcrUsageRecorder {
  record(attempt: OcrAttemptMetadata & {
    profile: OcrProfileName
    schemaVersion: string
  }): Promise<void>
}

export class OcrError extends Error {
  constructor(
    public readonly category: OcrErrorCategory,
    message: string,
    public readonly issueCodes: string[] = [],
  ) {
    super(message)
    this.name = 'OcrError'
  }
}
