import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { NewsCard } from '../components/NewsCard'
import { ErrorState, Reveal, Skel, pageMotion } from '../components/UI'
import { useApi } from '../lib/api'
import type { NewsArticle } from '../lib/types'

export default function News() {
  const news = useApi<NewsArticle[]>('/api/news', { poll: 300_000 })
  const [cat, setCat] = useState<string>('All')
  const cats = useMemo(() => {
    const count = new Map<string, number>()
    for (const a of news.data ?? []) {
      const l = a.categories?.find((c) => c.type === 'league')?.description?.replace(/ 20\d\d(\/\d\d)?$/, '')
      if (l) count.set(l, (count.get(l) ?? 0) + 1)
    }
    return ['All', ...[...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k)]
  }, [news.data])
  const list = (news.data ?? []).filter((a) => cat === 'All' || a.categories?.some((c) => c.type === 'league' && c.description?.startsWith(cat)))
  return (
    <motion.div className="page" {...pageMotion}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        Stories
      </div>
      <h1 className="large-title" style={{ marginBottom: 20 }}>
        News
      </h1>
      <div className="scroll-x" style={{ marginBottom: 24 }}>
        {cats.map((c) => (
          <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      {news.loading ? (
        <div className="grid auto">
          {Array.from({ length: 6 }, (_, i) => (
            <Skel key={i} h={300} r={24} />
          ))}
        </div>
      ) : news.error && !news.data ? (
        <ErrorState onRetry={news.refresh} />
      ) : (
        <>
          <div className="news-grid" style={{ marginBottom: 16 }}>
            {list.slice(0, 5).map((a, i) => (
              <Reveal key={a.id} delay={i * 0.05} className={i === 0 ? 'news-lead' : ''}>
                <NewsCard a={a} big={i === 0} />
              </Reveal>
            ))}
          </div>
          <div className="grid auto">
            {list.slice(5).map((a, i) => (
              <Reveal key={a.id} delay={Math.min(i, 8) * 0.03}>
                <NewsCard a={a} />
              </Reveal>
            ))}
          </div>
        </>
      )}
    </motion.div>
  )
}
