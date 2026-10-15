import { AnimatePresence } from 'motion/react'
import { lazy, Suspense } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { Shell } from './components/Shell'
import { Skel } from './components/UI'
import Home from './pages/Home'

const Matches = lazy(() => import('./pages/Matches'))
const Match = lazy(() => import('./pages/Match'))
const SeriesList = lazy(() => import('./pages/SeriesList'))
const Series = lazy(() => import('./pages/Series'))
const Player = lazy(() => import('./pages/Player'))
const News = lazy(() => import('./pages/News'))

function Fallback() {
  return (
    <div className="page">
      <Skel w="40%" h={48} r={14} />
      <Skel h={320} r={28} style={{ marginTop: 24 }} />
    </div>
  )
}

function NotFound() {
  return (
    <div className="page empty" style={{ paddingTop: 200 }}>
      <h1 className="large-title">Stumped.</h1>
      <p className="sub muted">That page doesn’t exist.</p>
      <Link to="/" className="btn" style={{ marginTop: 16 }}>
        Back to Home
      </Link>
    </div>
  )
}

export default function App() {
  const loc = useLocation()
  return (
    <Shell>
      <Suspense fallback={<Fallback />}>
        <AnimatePresence mode="wait">
          <Routes location={loc} key={loc.pathname}>
            <Route path="/" element={<Home />} />
            <Route path="/matches" element={<Matches />} />
            <Route path="/match/:league/:event" element={<Match />} />
            <Route path="/series" element={<SeriesList />} />
            <Route path="/series/:league" element={<Series />} />
            <Route path="/player/:id" element={<Player />} />
            <Route path="/news" element={<News />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AnimatePresence>
      </Suspense>
    </Shell>
  )
}
