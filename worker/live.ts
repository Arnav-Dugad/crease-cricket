/**
 * LiveRoom — one Durable Object per live match.
 *
 * Browsers hold a hibernating WebSocket to the room. While anyone is connected, the room
 * checks the match every few seconds (one upstream request, regardless of audience size)
 * and pushes a tiny "tick" when the score changes. Clients then pull fresh data through the
 * edge-cached HTTP API using the tick id as a cache key, so every viewer shares one fetch.
 * If upstream blocks the edge, the room tells clients to keep polling instead.
 */
import { DurableObject } from 'cloudflare:workers'
import { ESPN, ESPN_ALT } from '../shared/espn'

const INTERVAL_MS = 6000

interface Tick {
  type: 'tick'
  id: string
  state: string
  status: string
  score: string
}

export class LiveRoom extends DurableObject {
  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 })
    const url = new URL(req.url)
    const [league, event] = url.pathname.split('/').slice(-2)
    const date = url.searchParams.get('date') ?? ''
    await this.ctx.storage.put('match', { league, event, date })
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    const last = await this.ctx.storage.get<Tick>('last')
    if (last) pair[1].send(JSON.stringify(last))
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 500)
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  async alarm() {
    const sockets = this.ctx.getWebSockets()
    if (!sockets.length) return // everyone left: stop polling until the next connection
    const m = await this.ctx.storage.get<{ league: string; event: string; date: string }>('match')
    if (m) {
      try {
        const tick = await this.check(m)
        const last = await this.ctx.storage.get<Tick>('last')
        if (tick && tick.score + tick.status + tick.state !== (last ? last.score + last.status + last.state : '')) {
          await this.ctx.storage.put('last', tick)
          this.broadcast(tick)
        }
        if (tick?.state === 'post') {
          this.broadcast({ type: 'final' })
          return
        }
      } catch (e) {
        this.broadcast({ type: 'degraded', reason: (e as Error).message.slice(0, 80) })
      }
    }
    await this.ctx.storage.setAlarm(Date.now() + INTERVAL_MS)
  }

  private broadcast(msg: unknown) {
    const s = JSON.stringify(msg)
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(s)
      } catch {
        /* closed */
      }
    }
  }

  /** Lightweight check: the league scoreboard for the match day (~15 KB), not the 700 KB summary. */
  private async check(m: { league: string; event: string; date: string }): Promise<Tick | null> {
    const path = `/site/v2/sports/cricket/${m.league}/scoreboard${m.date ? `?dates=${m.date}` : ''}`
    let res = await fetch(ESPN + path, { headers: { 'user-agent': 'CreaseCricket/1.0' } })
    if (!res.ok) res = await fetch(ESPN_ALT + path, { headers: { 'user-agent': 'CreaseCricket/1.0' } })
    if (!res.ok) throw new Error(`upstream ${res.status}`)
    const d = (await res.json()) as { events?: { id: string; competitions?: { status?: { summary?: string; type?: { state?: string } }; competitors?: { score?: string }[] }[] }[] }
    const e = d.events?.find((x) => x.id === m.event)
    if (!e) return null
    const c = e.competitions?.[0]
    const score = (c?.competitors ?? []).map((x) => x.score ?? '').join('|')
    const state = c?.status?.type?.state ?? 'in'
    const status = c?.status?.summary ?? ''
    return { type: 'tick', id: `${Date.now()}`, state, status, score }
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    if (msg === 'ping') ws.send('pong')
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code, 'bye')
    } catch {
      /* already closed */
    }
  }
}
