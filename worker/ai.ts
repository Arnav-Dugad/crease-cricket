/**
 * AI "match story" generation for one 5-over block of an innings.
 *
 * Provider: Claude (claude-opus-5-5) when an ANTHROPIC_API_KEY secret is configured,
 * otherwise Cloudflare Workers AI (free tier). Results for completed blocks never change,
 * so they are cached at the edge for 30 days — each block is generated once, globally.
 */
import Anthropic from '@anthropic-ai/sdk'
import { resolve, type Getter } from '../shared/espn'
import { STORY_SYSTEM, buildStoryContext, headerFromSummary, type SlimBall } from '../shared/story'

export interface AiEnv {
  AI?: { run: (model: string, input: unknown) => Promise<unknown> }
  ANTHROPIC_API_KEY?: string
}

const WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const WORKERS_AI_FALLBACK = '@cf/meta/llama-3.1-8b-instruct-fp8'

async function withClaude(apiKey: string, context: string) {
  const client = new Anthropic({ apiKey })
  try {
    const res = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      // Simple summarisation: low effort keeps cost and latency down.
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: STORY_SYSTEM,
      messages: [{ role: 'user', content: context }],
    })
    if (res.stop_reason === 'refusal') return null
    const text = res.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')
      .trim()
    return text ? { text, model: 'Claude' } : null
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) console.warn('[ai] Claude rate limited')
    else if (e instanceof Anthropic.APIError) console.error('[ai] Claude API error', e.status, e.message)
    else console.error('[ai] Claude request failed', (e as Error).message)
    return null
  }
}

async function withWorkersAi(ai: NonNullable<AiEnv['AI']>, context: string) {
  for (const model of [WORKERS_AI_MODEL, WORKERS_AI_FALLBACK]) {
    try {
      const out = (await ai.run(model, {
        messages: [
          { role: 'system', content: STORY_SYSTEM },
          { role: 'user', content: context },
        ],
        max_tokens: 220,
        temperature: 0.6,
      })) as { response?: string }
      const text = out?.response?.trim()
      if (text) return { text, model: model.includes('70b') ? 'Llama 3.3 70B' : 'Llama 3.1 8B' }
    } catch (e) {
      console.warn('[ai] workers-ai', model, (e as Error).message)
    }
  }
  return null
}

export async function matchStory(env: AiEnv, get: Getter, league: string, event: string, inn: number, block: number) {
  const [summary, balls] = await Promise.all([
    resolve(`/api/match/${league}/${event}`, get).then((r) => r.data),
    resolve(`/api/balls/${league}/${event}`, get).then((r) => (r.data as { balls: SlimBall[] }).balls),
  ])
  const context = buildStoryContext(headerFromSummary(summary), balls, inn, block)
  if (!context) return null
  const out = env.ANTHROPIC_API_KEY ? await withClaude(env.ANTHROPIC_API_KEY, context) : null
  return out ?? (env.AI ? await withWorkersAi(env.AI, context) : null)
}
