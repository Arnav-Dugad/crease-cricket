import { useState } from 'react'
import { relTime } from '../lib/normalize'
import type { Video } from '../lib/types'
import { Icon } from './Icon'
import { Rail } from './Rail'
import { Sheet } from './Sheet'

const dur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export function VideoRail({ videos }: { videos: Video[] }) {
  const [open, setOpen] = useState<Video | null>(null)
  const list = videos.filter((v) => v.src && v.thumbnail)
  if (!list.length) return null
  return (
    <>
      <Rail label="Videos">
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
      </Rail>
      <Sheet open={!!open} onClose={() => setOpen(null)} label={open?.headline ?? 'Video'} width={960} top="8vh" dark>
        {open && (
          <div className="video-modal">
            <video src={open.src} poster={open.thumbnail} controls autoPlay playsInline />
            <div className="row gap-12" style={{ padding: '14px 18px', color: 'white' }}>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{open.headline}</div>
                {open.description && <div className="foot" style={{ opacity: 0.65 }}>{open.description}</div>}
              </div>
              <button className="icon-btn" style={{ color: 'white' }} onClick={() => setOpen(null)} aria-label="Close video">
                <Icon name="x" />
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  )
}
