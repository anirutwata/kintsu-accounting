export function isFlowAccountDocumentVoided(document: unknown): boolean {
  if (!document || typeof document !== 'object') return false
  const value = document as { statusString?: unknown; isDelete?: unknown }
  return value.isDelete === true || String(value.statusString || '').toLowerCase() === 'void'
}
