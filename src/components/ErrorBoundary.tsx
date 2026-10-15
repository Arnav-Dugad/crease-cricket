import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '../lib/telemetry'

interface Props {
  children: ReactNode
  /** Smaller inline card instead of a full-page message. */
  inline?: boolean
  label?: string
}

/** Contains a crash to the section that failed so the rest of the page keeps working. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { where: this.props.label ?? 'route', stack: info.componentStack?.slice(0, 600) })
  }

  render() {
    if (!this.state.error) return this.props.children
    if (this.props.inline)
      return (
        <div className="card empty" style={{ padding: 28 }}>
          <div className="headline" style={{ color: 'var(--text-2)' }}>This section couldn’t be displayed</div>
          <button className="link" style={{ marginTop: 8 }} onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      )
    return (
      <div className="page">
        <div className="card empty" style={{ padding: '56px 24px' }}>
          <div className="title2" style={{ marginBottom: 8 }}>
            Something went wrong
          </div>
          <div className="sub muted">This page hit an unexpected error. It has been reported.</div>
          <div className="row center gap-12" style={{ marginTop: 20 }}>
            <button className="btn" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <a className="btn ghost" href="/">
              Home
            </a>
          </div>
        </div>
      </div>
    )
  }
}
