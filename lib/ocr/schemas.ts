import { z } from 'zod'

export const slipProviderOutputSchema = z.object({
  amount_satang: z.number().int(),
  date: z.string(),
  time: z.string(),
  ref_number: z.string(),
  sender_name: z.string(),
  sender_bank: z.string(),
  sender_account: z.string(),
  recipient: z.string(),
  recipient_bank: z.string(),
  confidence: z.number(),
}).strict()

export const slipJsonSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    amount_satang: { type: 'integer' },
    date: { type: 'string' },
    time: { type: 'string' },
    ref_number: { type: 'string' },
    sender_name: { type: 'string' },
    sender_bank: { type: 'string' },
    sender_account: { type: 'string' },
    recipient: { type: 'string' },
    recipient_bank: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: [
    'amount_satang', 'date', 'time', 'ref_number', 'sender_name',
    'sender_bank', 'sender_account', 'recipient', 'recipient_bank', 'confidence',
  ],
}
