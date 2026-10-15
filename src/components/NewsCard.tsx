import { relTime } from '../lib/normalize'
import type { NewsArticle } from '../lib/types'
import { Icon } from './Icon'

export const articleUrl = (a: NewsArticle) => a.links?.web?.href ?? '#'

export function NewsCard({ a, big = false }: { a: NewsArticle; big?: boolean }) {
  const img = a.images?.[0]?.url
  const league = a.categories?.find((c) => c.type === 'league')?.description
  return (
    <a href={articleUrl(a)} target="_blank" rel="noreferrer" className="card interactive" style={{ display: 'flex', flexDirection: 'column', padding: 10, height: '100%' }}>
      {img && (
        <div className="story-img" style={{ aspectRatio: big ? '16/10' : '16/9' }}>
          <img src={img} alt={a.images?.[0]?.caption ?? ''} loading="lazy" decoding="async" />
        </div>
      )}
      <div className="stack gap-8" style={{ padding: big ? '18px 12px 12px' : '14px 8px 8px', flex: 1 }}>
        {league && (
          <div className="eyebrow ellipsis" style={{ color: 'var(--accent)' }}>
            {league.replace(/ 20\d\d(\/\d\d)?$/, '')}
          </div>
        )}
        <div className={big ? 'title2' : 'headline'} style={{ lineHeight: 1.25 }}>
          {a.headline}
        </div>
        {(big || !img) && <div className="sub muted">{a.description}</div>}
        <div className="foot faint row gap-6" style={{ marginTop: 'auto', paddingTop: 6 }}>
          {relTime(a.published)}
          {a.byline && <span className="dot-sep ellipsis">{a.byline}</span>}
          <Icon name="external" size={13} style={{ marginLeft: 'auto' }} />
        </div>
      </div>
    </a>
  )
}
