import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { relTime } from '../lib/normalize'
import type { Video } from '../lib/types'
import { Icon } from './Icon'
import { spring } from './UI'

const dur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export function VideoRail({ videos }: { videos: Video[] }) {
  const [open, setOpen] = useState<Video | null>(null)
  const list = videos.filter((v) => v.src && v.thumbnail)
  if (!list.length) return null
  return (
    <>
      <div className="rail">
        {list.map((v) => (
          <button key={v.id} className="card interactive" style={{ padding: 10, textAlign: 'left' }} onClick={() => setOpen(v)}>
            <div className="story-img">
              <img src={v.thumbnail} alt="" loading="lazy" />
              <span className="play-badge">
                <Icon name="play" size={12} /> {dur(v.duration)}
              </span>
            </div>
            <div style={{ padding: '12px 6px 4px' }}>
              <div className="headline" style={{ fontSize: 15, lineHeight: 1.3 }}>
                {v.headline}
              </div>
              {v.published && <div className="foot faint" style={{ marginTop: 4 }}>{relTime(v.published)}</div>}
            </div>
          </button>
        ))}
      </div>
      <AnimatePresence>{open && <VideoModal v={open} onClose={() => setOpen(null)} />}</AnimatePresence>
    </>
  )
}

function VideoModal({ v, onClose }: { v: Video; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <motion.div className="overlay" style={{ alignItems: 'center', paddingTop: 16 }} onMouseDown={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="video-modal" onMouseDown={(e) => e.stopPropagation()} initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={spring}>
        <video src={v.src} poster={v.thumbnail} controls autoPlay playsInline />
        <div className="row gap-12" style={{ padding: '14px 18px', color: 'white' }}>
          <div className="grow">
            <div style={{ fontWeight: 600 }}>{v.headline}</div>
            {v.description && <div className="foot" style={{ opacity: 0.65 }}>{v.description}</div>}
          </div>
          <button className="icon-btn" style={{ color: 'white' }} onClick={onClose} aria-label="Close video">
            <Icon name="x" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
