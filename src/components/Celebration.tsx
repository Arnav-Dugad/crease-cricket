import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { haptic, prefersReducedMotion } from '../lib/prefs'

export type Moment = { kind: 'six' | 'four' | 'wicket' | 'fifty' | 'hundred'; key: string; title: string; sub?: string }

const STYLE: Record<Moment['kind'], { color: string; label: string; vib: number | number[] }> = {
  six: { color: '#BF5AF2', label: 'SIX', vib: [20, 40, 20, 40, 60] },
  four: { color: '#0A84FF', label: 'FOUR', vib: [20, 40, 30] },
  wicket: { color: '#FF453A', label: 'WICKET', vib: [80, 60, 80] },
  fifty: { color: '#30D158', label: 'FIFTY', vib: [30, 30, 30] },
  hundred: { color: '#FFD60A', label: 'HUNDRED', vib: [30, 30, 30, 30, 90] },
}

function Confetti({ color }: { color: string }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        x: (Math.random() - 0.5) * 900,
        y: -200 - Math.random() * 420,
        r: Math.random() * 720 - 360,
        d: 0.9 + Math.random() * 0.8,
        s: 6 + Math.random() * 8,
        c: i % 3 === 0 ? color : i % 3 === 1 ? '#FFFFFF' : '#FFD60A',
      })),
    [color],
  )
  return (
    <>
      {bits.map((b, i) => (
        <motion.span
          key={i}
          style={{ position: 'absolute', left: '50%', top: '55%', width: b.s, height: b.s * 0.45, background: b.c, borderRadius: 2 }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: b.x, y: [0, b.y, b.y + 520], opacity: [1, 1, 0], rotate: b.r }}
          transition={{ duration: b.d * 1.6, ease: [0.2, 0.7, 0.4, 1] }}
        />
      ))}
    </>
  )
}

/**
 * Full-screen, non-blocking celebration for live moments: confetti burst for sixes,
 * a ripple for fours, a red shockwave for wickets, gold for milestones. Haptics on phones.
 */
export function Celebration({ moment }: { moment: Moment | null }) {
  const [show, setShow] = useState<Moment | null>(null)
  useEffect(() => {
    if (!moment) return
    setShow(moment)
    haptic(STYLE[moment.kind].vib)
    const t = setTimeout(() => setShow(null), 2600)
    return () => clearTimeout(t)
  }, [moment])
  if (prefersReducedMotion()) return null
  return (
    <AnimatePresence>
      {show && (
        <motion.div key={show.key} className="celebration" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} aria-live="polite">
          <motion.div
            className="celebration-ring"
            style={{ borderColor: STYLE[show.kind].color }}
            initial={{ scale: 0.2, opacity: 0.9 }}
            animate={{ scale: 3.2, opacity: 0 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          />
          {show.kind === 'wicket' && <motion.div className="celebration-flash" initial={{ opacity: 0.35 }} animate={{ opacity: 0 }} transition={{ duration: 0.9 }} />}
          {(show.kind === 'six' || show.kind === 'hundred') && <Confetti color={STYLE[show.kind].color} />}
          <motion.div
            className="celebration-card"
            initial={{ scale: 0.6, y: 30, opacity: 0, rotateX: 40 }}
            animate={{ scale: 1, y: 0, opacity: 1, rotateX: 0 }}
            exit={{ scale: 0.9, y: -20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20 }}
          >
            <div className="celebration-label" style={{ color: STYLE[show.kind].color }}>
              {STYLE[show.kind].label}
            </div>
            <div className="headline">{show.title}</div>
            {show.sub && <div className="foot muted">{show.sub}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
