import { animate, motion, useInView, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { MatchLite } from '../lib/types'
import { Icon } from './Icon'

export const spring = { type: 'spring', stiffness: 380, damping: 34, mass: 0.9 } as const
export const softSpring = { type: 'spring', stiffness: 160, damping: 24 } as const

export function Segmented<T extends string>({ value, options, onChange, layout }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; layout?: string }) {
  const id = useId()
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={`seg ${value === o.value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {value === o.value && <motion.span layoutId={layout ?? id} className="pill-bg" transition={spring} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Reveal({ children, delay = 0, y = 18, className, style }: { children: ReactNode; delay?: number; y?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.7, delay, ease: [0.32, 0.72, 0, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function SectionHead({ title, sub, to, linkText = 'See all' }: { title: ReactNode; sub?: ReactNode; to?: string; linkText?: string }) {
  return (
    <div className="section-head">
      <h2>
        {title} {sub && <span>{sub}</span>}
      </h2>
      {to && (
        <Link className="link" to={to}>
          {linkText} <Icon name="chevron" size={14} stroke={2.2} />
        </Link>
      )}
    </div>
  )
}

export function StateBadge({ m }: { m: MatchLite }) {
  if (m.state === 'in')
    return (
      <span className="badge live">
        <span className="live-dot" /> Live
      </span>
    )
  if (m.state === 'post') return <span className="badge result">{/abandon|no result|cancel/i.test(m.status) ? 'No result' : 'Result'}</span>
  return <span className="badge upcoming">Upcoming</span>
}

export function Skel({ w = '100%', h = 16, r = 10, style }: { w?: number | string; h?: number | string; r?: number; style?: React.CSSProperties }) {
  return <div className="skel" style={{ width: w, height: h, borderRadius: r, ...style }} />
}

export function CardSkeleton({ h = 168 }: { h?: number }) {
  return (
    <div className="card mcard" style={{ minHeight: h }}>
      <Skel w="40%" h={12} />
      <div className="row gap-12">
        <Skel w={32} h={32} r={16} />
        <Skel w="50%" h={16} />
      </div>
      <div className="row gap-12">
        <Skel w={32} h={32} r={16} />
        <Skel w="40%" h={16} />
      </div>
      <Skel w="70%" h={12} style={{ marginTop: 'auto' }} />
    </div>
  )
}

/** Number that counts up when it scrolls into view (or changes). */
export function CountUp({ value, decimals = 0, duration = 1.2 }: { value: number; decimals?: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const mv = useMotionValue(0)
  const text = useTransform(mv, (v) => v.toFixed(decimals))
  useEffect(() => {
    if (!inView) return
    const c = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] })
    return () => c.stop()
  }, [inView, value, duration, mv])
  return <motion.span ref={ref}>{text}</motion.span>
}

export function ErrorState({ onRetry, text = 'We couldn’t reach the scores service.' }: { onRetry?: () => void; text?: string }) {
  return (
    <div className="card empty">
      <div className="title3">Something went wrong</div>
      <div className="sub">{text}</div>
      {onRetry && (
        <button className="btn ghost" style={{ marginTop: 16 }} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <div className="card empty">
      <div className="title3">{title}</div>
      {text && <div className="sub">{text}</div>}
    </div>
  )
}

export const pageMotion = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.32, 0.72, 0, 1] } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.2 } },
} as const
