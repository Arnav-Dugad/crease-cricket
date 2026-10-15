import { motion, useInView } from 'motion/react'
import { useMemo, useRef } from 'react'
import { useApi } from '../../lib/api'
import { BLOCK, completedBlocks } from '../../../shared/story'
import type { MatchCtx } from '../../pages/Match'
import { Icon } from '../Icon'
import { Skel } from '../UI'

function StoryBlock({ ctx, inn, block, team, color }: { ctx: MatchCtx; inn: number; block: number; team: string; color: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useInView(ref, { once: true, margin: '200px' })
  const res = useApi<{ text: string; model: string }>(seen ? `/api/ai/story/${ctx.league}/${ctx.event}/${inn}/${block}` : null, { staleMs: 7 * 86400_000 })
  const from = block * BLOCK + 1
  const to = (block + 1) * BLOCK
  return (
    <div ref={ref} className="story-block">
      <div className="story-dot" style={{ background: color }} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row gap-8" style={{ marginBottom: 4 }}>
          <span className="headline" style={{ fontSize: 15 }}>
            {team} · overs {from}–{to}
          </span>
        </div>
        {res.data ? (
          <motion.p className="sub muted" style={{ margin: 0, lineHeight: 1.55 }} initial={{ opacity: 0, filter: 'blur(4px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.6 }}>
            {res.data.text}
          </motion.p>
        ) : res.error ? (
          <p className="foot faint" style={{ margin: 0 }}>
            The story for this phase isn’t available right now.
          </p>
        ) : (
          <div className="stack gap-6">
            <Skel h={12} />
            <Skel h={12} w="85%" />
          </div>
        )}
        {res.data && (
          <div className="cap faint" style={{ marginTop: 6 }}>
            <Icon name="sparkles" size={11} /> Written by {res.data.model}
          </div>
        )}
      </div>
    </div>
  )
}

/** AI-written narrative of the match, one short paragraph per 5-over phase, newest first. */
export function MatchStory({ ctx }: { ctx: MatchCtx }) {
  const blocks = useMemo(() => {
    const out: { inn: number; block: number; team: string; teamId: string }[] = []
    ctx.innings.forEach((inn, k) => {
      const done = k < ctx.innings.length - 1 || ctx.m.state === 'post' || inn.wkts >= 10 || (inn.limit > 0 && inn.legal >= inn.limit)
      const n = completedBlocks(inn.balls, inn.inn, done)
      for (let b = 0; b < n; b++) out.push({ inn: inn.inn, block: b, team: inn.team, teamId: inn.teamId })
    })
    return out.reverse().slice(0, ctx.innings[0]?.limit > 300 || !ctx.innings[0]?.limit ? 8 : 24)
  }, [ctx.innings, ctx.m.state])
  if (!blocks.length) return null
  return (
    <div className="card pad">
      <div className="row between wrap gap-8" style={{ marginBottom: 14 }}>
        <div>
          <div className="title3">The story so far</div>
          <div className="foot faint">A short AI-written recap of every five overs, generated from the ball-by-ball data</div>
        </div>
        <span className="badge">
          <Icon name="sparkles" size={12} /> AI
        </span>
      </div>
      <div className="story-list">
        {blocks.map((b) => (
          <StoryBlock key={`${b.inn}-${b.block}`} ctx={ctx} inn={b.inn} block={b.block} team={b.team} color={ctx.colorOf(b.teamId)} />
        ))}
      </div>
    </div>
  )
}
