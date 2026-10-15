import { AnimatePresence } from 'motion/react'
import { lazy, Suspense } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
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
            <Route path="/" element={<ErrorBoundary key={loc.pathname}><Home /></ErrorBoundary>} />
            <Route path="/matches" element={<ErrorBoundary key={loc.pathname}><Matches /></ErrorBoundary>} />
            <Route path="/match/:league/:event" element={<ErrorBoundary key={loc.pathname}><Match /></ErrorBoundary>} />
            <Route path="/series" element={<ErrorBoundary key={loc.pathname}><SeriesList /></ErrorBoundary>} />
            <Route path="/series/:league" element={<ErrorBoundary key={loc.pathname}><Series /></ErrorBoundary>} />
            <Route path="/player/:id" element={<ErrorBoundary key={loc.pathname}><Player /></ErrorBoundary>} />
            <Route path="/news" element={<ErrorBoundary key={loc.pathname}><News /></ErrorBoundary>} />
            <Route path="*" element={<ErrorBoundary key={loc.pathname}><NotFound /></ErrorBoundary>} />
          </Routes>
        </AnimatePresence>
      </Suspense>
    </Shell>
  )
}
