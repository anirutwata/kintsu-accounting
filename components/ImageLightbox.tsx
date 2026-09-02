'use client'

import { useEffect } from 'react'

interface ImageLightboxProps {
  src: string | null
  alt?: string
  onClose: () => void
}

export function ImageLightbox({ src, alt = 'รูปเอกสาร', onClose }: ImageLightboxProps) {
  useEffect(() => {
    if (!src) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [src, onClose])

  if (!src) return null
  return (
    <div role="dialog" aria-modal="true" aria-label="ดูรูปเอกสารขนาดใหญ่"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-auto bg-black/90 p-3 sm:p-6"
      onClick={onClose}>
      <div className="flex min-h-full w-full items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt}
          className="max-h-[calc(100dvh-1.5rem)] max-w-full rounded-2xl border-2 border-white/80 bg-white object-contain shadow-2xl"
          onClick={event => event.stopPropagation()} />
      </div>
      <button type="button" aria-label="ปิดรูป"
        className="fixed right-4 top-4 flex h-12 w-12 items-center justify-center rounded-full bg-black/65 text-3xl text-white shadow-lg backdrop-blur-sm"
        onClick={onClose}>×</button>
    </div>
  )
}
