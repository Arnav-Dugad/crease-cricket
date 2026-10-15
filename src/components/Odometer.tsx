import { AnimatePresence, motion } from 'motion/react'

/**
 * Rolling-digit score display. Each character animates independently, so going from
 * 148/3 to 152/3 rolls only the digits that changed — like a stadium scoreboard.
 */
export function Odometer({ value, className, style }: { value: string; className?: string; style?: React.CSSProperties }) {
  const chars = value.split('')
  return (
    <span className={`odometer tnum ${className ?? ''}`} style={style} aria-label={value}>
      {chars.map((ch, i) => (
        <span key={`${chars.length - i}`} className="odo-slot" aria-hidden>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={ch}
              className="odo-char"
              initial={{ y: '-90%', opacity: 0, filter: 'blur(3px)' }}
              animate={{ y: '0%', opacity: 1, filter: 'blur(0px)' }}
              exit={{ y: '90%', opacity: 0, filter: 'blur(3px)' }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            >
              {ch}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  )
}
