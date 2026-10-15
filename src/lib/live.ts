import { useEffect, useRef, useState } from 'react'

/**
 * Real-time channel to a match's LiveRoom (Durable Object) over WebSocket.
 * Returns the latest tick id (use it as a cache key to pull fresh data) and the
 * connection state. Reconnects with backoff; reports 'degraded' when the room can't
 * reach upstream so the page keeps polling.
 */
export type LiveState = 'off' | 'connecting' | 'live' | 'degraded'

export function useLiveChannel(league: string, event: string, date: string | null, enabled: boolean) {
  const [tick, setTick] = useState<string | null>(null)
  const [state, setState] = useState<LiveState>('off')
  const retry = useRef(0)

  useEffect(() => {
    if (!enabled || typeof WebSocket === 'undefined') {
      setState('off')
      return
    }
    let ws: WebSocket | null = null
    let closed = false
    let ping: ReturnType<typeof setInterval> | undefined
    let timer: ReturnType<typeof setTimeout> | undefined

    const connect = () => {
      setState('connecting')
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/api/live/${league}/${event}${date ? `?date=${date}` : ''}`)
      ws.onopen = () => {
        retry.current = 0
        setState('live')
        ping = setInterval(() => ws?.readyState === 1 && ws.send('ping'), 25_000)
      }
      ws.onmessage = (e) => {
        if (e.data === 'pong') return
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'tick') {
            setTick(msg.id)
            setState('live')
          } else if (msg.type === 'degraded') setState('degraded')
          else if (msg.type === 'final') setTick(`final-${Date.now()}`)
        } catch {
          /* ignore */
        }
      }
      ws.onclose = () => {
        clearInterval(ping)
        if (closed) return
        setState('connecting')
        const wait = Math.min(30_000, 1000 * 2 ** retry.current++)
        timer = setTimeout(connect, wait)
      }
      ws.onerror = () => ws?.close()
    }
    connect()
    return () => {
      closed = true
      clearInterval(ping)
      clearTimeout(timer)
      ws?.close()
    }
  }, [league, event, date, enabled])

  return { tick, state }
}

/* ---------- Lock-screen score (Media Session) ---------- */

/**
 * Shows a live score card on the phone's lock screen / notification shade by playing a
 * silent audio loop and publishing the score as "now playing" metadata — the web's
 * closest equivalent to a Live Activity. Must be started from a user gesture.
 */
let audio: HTMLAudioElement | null = null

function silentWav() {
  // 1 second of 8 kHz mono silence
  const n = 8000
  const buf = new ArrayBuffer(44 + n)
  const v = new DataView(buf)
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF')
  v.setUint32(4, 36 + n, true)
  w(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, 8000, true)
  v.setUint32(28, 8000, true)
  v.setUint16(32, 1, true)
  v.setUint16(34, 8, true)
  w(36, 'data')
  v.setUint32(40, n, true)
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128)
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}

export const lockScreenSupported = () => typeof navigator !== 'undefined' && 'mediaSession' in navigator

export async function startLockScreen() {
  if (!lockScreenSupported()) return false
  if (!audio) {
    audio = new Audio(silentWav())
    audio.loop = true
    audio.volume = 0.01
  }
  try {
    await audio.play()
  } catch {
    return false
  }
  navigator.mediaSession.setActionHandler('pause', () => stopLockScreen())
  navigator.mediaSession.setActionHandler('stop', () => stopLockScreen())
  return true
}

export function updateLockScreen(title: string, artist: string, album: string, artwork?: string | null) {
  if (!audio || audio.paused || !lockScreenSupported()) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist,
    album,
    artwork: artwork ? [{ src: artwork, sizes: '256x256', type: 'image/png' }] : [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
  })
  navigator.mediaSession.playbackState = 'playing'
}

export function stopLockScreen() {
  audio?.pause()
  if (lockScreenSupported()) {
    navigator.mediaSession.metadata = null
    navigator.mediaSession.playbackState = 'none'
  }
}

export const lockScreenActive = () => !!audio && !audio.paused

/** App badge (installed PWA): number of live matches. */
export function setLiveBadge(n: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  try {
    if (n > 0) nav.setAppBadge?.(n)
    else nav.clearAppBadge?.()
  } catch {
    /* unsupported */
  }
}
