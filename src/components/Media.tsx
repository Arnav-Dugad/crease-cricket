import { useState } from 'react'
import { espnImg, hashColor, isDefaultHeadshot } from '../lib/normalize'
import { useApi } from '../lib/api'
import type { WikiInfo } from '../lib/types'

const initials = (n: string | undefined) =>
  (n ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

export function TeamLogo({ src, name, color, size = 36 }: { src?: string | null; name: string; color?: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const url = espnImg(src, size * 3)
  if (!url || failed)
    return (
      <span className="logo mono" style={{ width: size, height: size, background: `linear-gradient(145deg, ${color ?? hashColor(name)}, color-mix(in srgb, ${color ?? hashColor(name)} 60%, #000))`, fontSize: size * 0.34 }}>
        {initials(name).slice(0, 3)}
      </span>
    )
  return (
    <span className="logo" style={{ width: size, height: size }}>
      <img src={url} alt={name} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </span>
  )
}

export function useWiki(q: string | null | undefined) {
  return useApi<WikiInfo>(q ? `/api/wiki?q=${encodeURIComponent(q)}` : null, { staleMs: 86400_000 })
}

/** Player avatar — ESPN headshot first, Wikipedia portrait as a fallback when `wiki` is enabled. */
export function Avatar({ src, name, size = 40, wiki = false }: { src?: string | null; name: string; size?: number; wiki?: boolean }) {
  const [failed, setFailed] = useState(false)
  const needWiki = wiki && (isDefaultHeadshot(src) || failed)
  const w = useWiki(needWiki ? `${name} cricketer` : null)
  const wikiImg = needWiki && w.data?.image && /cricket/i.test(w.data.extract ?? '') ? w.data.image : null
  const url = !isDefaultHeadshot(src) && !failed ? espnImg(src, size * 3) : wikiImg
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {url ? <img src={url} alt={name} loading="lazy" decoding="async" onError={() => setFailed(true)} /> : initials(name)}
    </span>
  )
}

export function LeagueLogo({ src, name, size = 32 }: { src?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed)
    return (
      <span className="logo mono" style={{ width: size, height: size, borderRadius: size * 0.3, background: `linear-gradient(145deg, ${hashColor(name)}, color-mix(in srgb, ${hashColor(name)} 55%, #000))`, fontSize: size * 0.32 }}>
        {initials(name.replace(/^ICC /, ''))}
      </span>
    )
  return (
    <span className="logo" style={{ width: size, height: size, borderRadius: size * 0.3 }}>
      <img src={espnImg(src, size * 3) ?? src} alt="" loading="lazy" onError={() => setFailed(true)} />
    </span>
  )
}
