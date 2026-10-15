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
const Rankings = lazy(() => import('./pages/Rankings'))
const Team = lazy(() => import('./pages/Team'))
const Multi = lazy(() => import('./pages/Multi'))

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

const routes: [string, () => React.ReactElement][] = [
  ['/', () => <Home />],
  ['/matches', () => <Matches />],
  ['/match/:league/:event', () => <Match />],
  ['/series', () => <SeriesList />],
  ['/series/:league', () => <Series />],
  ['/player/:id', () => <Player />],
  ['/team/:id/:name?', () => <Team />],
  ['/rankings', () => <Rankings />],
  ['/multi', () => <Multi />],
  ['/news', () => <News />],
  ['*', () => <NotFound />],
]

export default function App() {
  const loc = useLocation()
  return (
    <Shell>
      <Suspense fallback={<Fallback />}>
        <Routes location={loc}>
          {routes.map(([path, el]) => (
            <Route key={path} path={path} element={<ErrorBoundary key={loc.pathname}>{el()}</ErrorBoundary>} />
          ))}
        </Routes>
      </Suspense>
    </Shell>
  )
}
