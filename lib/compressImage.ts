// Client-side pass before upload. Vercel enforces a hard ~4.5MB request-body limit on
// Serverless Functions at the platform level — a full-resolution phone photo (often
// 5-10MB) gets rejected there before app/api/upload/receipt/route.ts ever runs, so
// no amount of server-side compression (sharp) can save it. Shrinking here keeps the
// upload well under that ceiling regardless of what the camera produced.
const MAX_DIMENSION_PX = 1800
const JPEG_QUALITY = 0.82

export async function compressImageFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  try {
    // imageOrientation: 'from-image' bakes the phone's EXIF rotation into the drawn
    // pixels — the re-encoded JPEG below carries no EXIF tag, so this is the only
    // chance to apply it before that information is gone.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob) return file

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
  } catch {
    // Not a format the browser can decode into a bitmap, or canvas/createImageBitmap
    // unsupported — fall back to the original file and let the upload endpoint (and
    // its own sharp-based compression) handle it as best it can.
    return file
  }
}
