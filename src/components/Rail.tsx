import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * Horizontal scroller with glass arrow buttons on pointer devices (hidden on touch).
 * Arrows appear only when there is more content in that direction, and page by ~85%.
 */
export function Rail({ children, className = 'rail', style, arrowsInset = 0, label }: { children: ReactNode; className?: string; style?: CSSProperties; arrowsInset?: number; label?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ start: true, end: true })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', measure)
      ro.disconnect()
    }
  }, [measure, children])

  const page = (dir: 1 | -1) => {
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  return (
    <div className="rail-wrap" role="region" aria-label={label}>
      <div ref={ref} className={className} style={style}>
        {children}
      </div>
      <button className={`rail-arrow left ${edge.start ? 'hidden' : ''}`} style={{ left: arrowsInset }} onClick={() => page(-1)} aria-label="Scroll left" tabIndex={edge.start ? -1 : 0}>
        <Icon name="back" size={18} stroke={2.4} />
      </button>
      <button className={`rail-arrow right ${edge.end ? 'hidden' : ''}`} style={{ right: arrowsInset }} onClick={() => page(1)} aria-label="Scroll right" tabIndex={edge.end ? -1 : 0}>
        <Icon name="chevron" size={18} stroke={2.4} />
      </button>
    </div>
  )
}
