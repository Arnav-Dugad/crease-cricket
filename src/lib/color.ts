import { useEffect, useState } from 'react'

/**
 * Dominant (vivid, mid-luminance) colour of an image, sampled on a tiny canvas.
 * Requires the image host to allow CORS (Wikimedia and ESPN CDNs do). Cached per URL.
 */
const cache = new Map<string, Promise<string | null>>()

function extract(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        const W = 36, H = 24
        c.width = W
        c.height = H
        const ctx = c.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(img, 0, 0, W, H)
        const d = ctx.getImageData(0, 0, W, H).data
        // bucket colours; weight by saturation so skies/greens beat greys
        const buckets = new Map<string, { r: number; g: number; b: number; w: number }>()
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2]
          const max = Math.max(r, g, b), min = Math.min(r, g, b)
          const l = (max + min) / 510
          const s = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255))
          if (l < 0.12 || l > 0.9) continue
          const key = `${r >> 5}-${g >> 5}-${b >> 5}`
          const e = buckets.get(key) ?? { r: 0, g: 0, b: 0, w: 0 }
          const w = 0.2 + s * s
          e.r += r * w
          e.g += g * w
          e.b += b * w
          e.w += w
          buckets.set(key, e)
        }
        const best = [...buckets.values()].sort((a, b) => b.w - a.w)[0]
        if (!best) return resolve(null)
        const hex = (v: number) => Math.round(v / best.w).toString(16).padStart(2, '0')
        resolve(`#${hex(best.r)}${hex(best.g)}${hex(best.b)}`)
      } catch {
        resolve(null) // tainted canvas (no CORS)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export function useImageTint(url: string | null | undefined) {
  const [tint, setTint] = useState<string | null>(null)
  useEffect(() => {
    if (!url) return
    let p = cache.get(url)
    if (!p) {
      p = extract(url)
      cache.set(url, p)
    }
    let alive = true
    p.then((c) => alive && setTint(c))
    return () => {
      alive = false
    }
  }, [url])
  return tint
}
