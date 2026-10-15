import { motion } from 'motion/react'
import { haptic, toggleTeam, togglePlayer, useFollows, type FollowTeam } from '../lib/prefs'
import { Icon } from './Icon'

export function FollowTeamButton({ team, compact = false, onDark = false }: { team: FollowTeam; compact?: boolean; onDark?: boolean }) {
  const f = useFollows()
  const on = f.teams.some((t) => t.id === team.id)
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      className={`follow-btn ${on ? 'on' : ''} ${onDark ? 'dark' : ''}`}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggleTeam(team)
        haptic(10)
      }}
      aria-pressed={on}
      aria-label={on ? `Unfollow ${team.name}` : `Follow ${team.name}`}
    >
      <Icon name="star" size={15} stroke={2} fill={on ? 'currentColor' : 'none'} />
      {!compact && (on ? 'Following' : 'Follow')}
    </motion.button>
  )
}

export function FollowPlayerButton({ id, name }: { id: string; name: string }) {
  const f = useFollows()
  const on = f.players.some((p) => p.id === id)
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      className={`follow-btn ${on ? 'on' : ''}`}
      onClick={() => {
        togglePlayer({ id, name })
        haptic(10)
      }}
      aria-pressed={on}
    >
      <Icon name="star" size={15} stroke={2} fill={on ? 'currentColor' : 'none'} />
      {on ? 'Following' : 'Follow'}
    </motion.button>
  )
}
