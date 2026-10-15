import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react'
import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { spring } from './UI'

const mq = typeof window !== 'undefined' ? matchMedia('(max-width: 760px)') : null
export function useIsMobile() {
  return useSyncExternalStore(
    (cb) => {
      mq?.addEventListener('change', cb)
      return () => mq?.removeEventListener('change', cb)
    },
    () => !!mq?.matches,
  )
}

/**
 * Modal surface: a bottom sheet with a grab handle and swipe-to-dismiss on phones,
 * a centred glass panel on larger screens.
 */
export function Sheet({ open, onClose, children, width = 640, label, top = '12vh', dark = false }: { open: boolean; onClose: () => void; children: ReactNode; width?: number; label: string; top?: string; dark?: boolean }) {
  const mobile = useIsMobile()
  const drag = useDragControls()

  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', k)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose()
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay"
          style={mobile ? { alignItems: 'flex-end', padding: 0 } : { paddingTop: top }}
          onMouseDown={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className={`sheet ${mobile ? 'mobile' : ''} ${dark ? 'dark' : ''}`}
            style={{ width: mobile ? '100%' : `min(${width}px, 100%)` }}
            onMouseDown={(e) => e.stopPropagation()}
            initial={mobile ? { y: '100%' } : { opacity: 0, scale: 0.96, y: -10 }}
            animate={mobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={mobile ? { y: '100%' } : { opacity: 0, scale: 0.97, y: -6 }}
            transition={spring}
            drag={mobile ? 'y' : false}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
          >
            {mobile && (
              <div className="sheet-handle" onPointerDown={(e) => drag.start(e)} style={{ touchAction: 'none' }}>
                <span />
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
