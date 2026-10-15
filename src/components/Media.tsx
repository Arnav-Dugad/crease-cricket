import { motion } from 'motion/react'
import { useState, type CSSProperties } from 'react'
import { useApi } from '../lib/api'
import { flagFor, nationLogo, nationOf } from '../lib/flags'
import { espnImg, hashColor, headshotUrl, isDefaultHeadshot } from '../lib/normalize'
import { usePersonImage } from '../lib/people'
import type { WikiInfo } from '../lib/types'

const initials = (n: string | undefined) =>
  (n ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

/**
 * Progressive image: a tiny blurred preview (when one is available) sharpens into the
 * full-resolution image with a soft fade. Falls through `srcs` on error.
 */
export function Img({
  srcs,
  alt,
  preview,
  className,
  style,
  imgStyle,
  priority = false,
  onAllFailed,
}: {
  srcs: (string | null | undefined)[]
  alt: string
  preview?: string | null
  className?: string
  style?: CSSProperties
  imgStyle?: CSSProperties
  priority?: boolean
  onAllFailed?: () => void
}) {
  const list = srcs.filter(Boolean) as string[]
  const [i, setI] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const src = list[i]
  if (!src) return null
  return (
    <span className={`img-wrap ${className ?? ''}`} style={style}>
      {preview && !loaded && <img src={preview} alt="" aria-hidden className="img-preview" style={imgStyle} />}
      <img
        key={src}
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        // @ts-expect-error fetchpriority is valid HTML
        fetchpriority={priority ? 'high' : undefined}
        className={`img-main ${loaded ? 'in' : ''}`}
        style={imgStyle}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(false)
          if (i + 1 < list.length) setI(i + 1)
          else onAllFailed?.()
        }}
      />
    </span>
  )
}

/* ---------- team logos ---------- */

export function useTsdbTeam(name: string | null | undefined) {
  return useApi<{ badge: string | null; logo: string | null; banner: string | null; fanart: string[]; jersey: string | null; stadium: string | null; stadiumThumb: string | null; description: string | null; founded: string | null } | null>(
    name ? `/api/tsdb/team?name=${encodeURIComponent(name)}` : null,
    { staleMs: 86400_000 },
  )
}

/**
 * Team logo with fallbacks: ESPN logo → national flag (for countries) →
 * TheSportsDB badge (franchises) → coloured monogram.
 */
export function TeamLogo({ src, name, color, size = 36, flat = false }: { src?: string | null; name: string; color?: string; size?: number; flat?: boolean }) {
  const [failed, setFailed] = useState(0) // how many candidates have failed to load
  const nation = nationOf(name)
  const espnUrl = src ? espnImg(src, size * 3) : null
  const nationUrl = nation ? nationLogo(nation, size > 60 ? 320 : 160) : null
  // Franchise/club sides: only ask TheSportsDB once ESPN has nothing usable.
  const tsdb = useTsdbTeam(!nation && failed >= (espnUrl ? 1 : 0) && name !== 'TBC' ? name : null)
  const tsdbUrl = tsdb.data?.badge ? `${tsdb.data.badge}/small` : null
  const list = [espnUrl, nationUrl, tsdbUrl].filter(Boolean) as string[]
  const url = list[failed] ?? null
  const next = () => setFailed((n) => n + 1)
  if (!url) {
    const c = color ?? hashColor(name)
    return (
      <span className="logo mono" style={{ width: size, height: size, background: `linear-gradient(145deg, ${c}, color-mix(in srgb, ${c} 60%, #000))`, fontSize: size * 0.34 }} aria-label={name}>
        {initials(name).slice(0, 3)}
      </span>
    )
  }
  const isFlag = url.includes('flagcdn')
  return (
    <span className={`logo ${flat ? 'flat' : ''} ${isFlag ? 'flag' : ''}`} style={{ width: size, height: size }}>
      <img src={url} alt={name} loading="lazy" decoding="async" onError={next} />
    </span>
  )
}

/* ---------- player avatars ---------- */

export function useWiki(q: string | null | undefined) {
  return useApi<WikiInfo>(q ? `/api/wiki?q=${encodeURIComponent(q)}` : null, { staleMs: 86400_000 })
}

/**
 * Player avatar: ESPN headshot → Wikidata photo (exact match by Cricinfo ID) → initials.
 * Pass `id` whenever available; `src` may be omitted (we derive the ESPN headshot from the id).
 */
export function Avatar({ src, id, name, size = 40, ring }: { src?: string | null; id?: string | null; name: string; size?: number; ring?: string; wiki?: boolean }) {
  const [espnFailed, setEspnFailed] = useState(false)
  const [wdFailed, setWdFailed] = useState(false)
  const espn = !isDefaultHeadshot(src) ? src : src === undefined && id ? headshotUrl(id) : null
  const useWd = (!espn || espnFailed) && !!id
  const person = usePersonImage(id, useWd)
  const wd = useWd && !wdFailed ? (size > 60 ? person?.img2x : person?.img) : null
  const url = espn && !espnFailed ? espnImg(espn, size * 3) : wd
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36, boxShadow: ring ? `0 0 0 2px var(--bg-2), 0 0 0 4px ${ring}` : undefined }}>
      {url ? (
        <motion.img
          key={url}
          src={url}
          alt={name}
          loading="lazy"
          decoding="async"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
          onError={() => (url === wd ? setWdFailed(true) : setEspnFailed(true))}
        />
      ) : (
        initials(name)
      )}
    </span>
  )
}

export function LeagueLogo({ src, name, size = 32 }: { src?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const flag = flagFor(name.replace(/ (tour of|in) .*/i, ''))
  if (!src || failed) {
    const c = hashColor(name)
    return flag ? (
      <span className="logo flag" style={{ width: size, height: size, borderRadius: size * 0.3 }}>
        <img src={flag} alt="" loading="lazy" />
      </span>
    ) : (
      <span className="logo mono" style={{ width: size, height: size, borderRadius: size * 0.3, background: `linear-gradient(145deg, ${c}, color-mix(in srgb, ${c} 55%, #000))`, fontSize: size * 0.32 }}>
        {initials(name.replace(/^ICC /, ''))}
      </span>
    )
  }
  return (
    <span className="logo" style={{ width: size, height: size, borderRadius: size * 0.3 }}>
      <img src={espnImg(src, size * 3) ?? src} alt="" loading="lazy" onError={() => setFailed(true)} />
    </span>
  )
}
