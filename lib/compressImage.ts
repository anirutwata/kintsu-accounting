// Client-side pass before upload. Vercel enforces a hard ~4.5MB request-body limit on
// Serverless Functions at the platform level — a full-resolution phone photo (often
// 5-10MB) gets rejected there before app/api/upload/receipt/route.ts ever runs, so
// no amount of server-side compression (sharp, previously) can save it. Shrinking here
// keeps the upload well under that ceiling regardless of what the camera produced.
//
// This also has to run server-independent: sharp's native libvips binary reliably
// failed to load in Vercel's deployed function (see route.ts), so HEIC/HEIF decoding
// happens here too, via heic2any's WASM build — no native binding, no repeat of that bug.
const MAX_DIMENSION_PX = 1800
const JPEG_QUALITY = 0.82

function isHeic(file: File): boolean {
  const type = file.type.toLowerCase()
  if (type === 'image/heic' || type === 'image/heif' || type === 'image/heic-sequence' || type === 'image/heif-sequence') return true
  // iOS reports an empty/generic type for HEIC in some browser versions — the file
  // extension is the reliable fallback signal.
  return /\.hei[cf]$/i.test(file.name)
}

export async function compressImageFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/') && !isHeic(file)) return file

  let workingFile = file
  if (isHeic(file)) {
    try {
      const heic2any = (await import('heic2any')).default
      const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: JPEG_QUALITY })
      const blob = Array.isArray(converted) ? converted[0] : converted
      workingFile = new File([blob], file.name.replace(/\.hei[cf]$/i, '.jpg'), { type: 'image/jpeg' })
    } catch {
      // Couldn't decode HEIC in-browser (unsupported input, corrupt file) — fall through
      // and let the canvas step below try the original bytes, then the raw-file fallback
      // at the very end if that fails too.
    }
  }

  try {
    // imageOrientation: 'from-image' bakes the phone's EXIF rotation into the drawn
    // pixels — the re-encoded JPEG below carries no EXIF tag, so this is the only
    // chance to apply it before that information is gone.
    const bitmap = await createImageBitmap(workingFile, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return workingFile
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob) return workingFile

    const baseName = workingFile.name.replace(/\.[^.]+$/, '') || 'photo'
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
  } catch {
    // Not a format the browser can decode into a bitmap, or canvas/createImageBitmap
    // unsupported — fall back to the (possibly already HEIC-converted) file as-is and
    // let the upload endpoint store it unprocessed rather than failing the upload.
    return workingFile
  }
}
