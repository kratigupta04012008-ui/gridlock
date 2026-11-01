/**
 * GRID LOCK — HUD Metrics Panel (Phase 4: LLM Multi-Agent Control & Token Optimization)
 *
 * Strict Honesty Rules:
 * - Collisions: Real count from SAT collision detector
 * - LLM latency: Real provider ms, rolling avg, and max ms
 * - Tokens: Native provider-reported input & output tokens displayed in real-time
 * - Vehicles safely cleared: Real clearedClean count from simulation engine
 * - Active vehicles: Real active + waiting vehicle count on map
 */

import { MetricCard } from './MetricCard.jsx'

export function HudPanel({ metrics, llmMetrics, activeControllerKey }) {
  const collisions = metrics?.collisions ?? 0
  const clearedClean = metrics?.clearedClean ?? 0
  const clearedTotal = metrics?.clearedTotal ?? 0
  const activeCount = (metrics?.active ?? 0) + (metrics?.waiting ?? 0)

  const isLLM = activeControllerKey === 'llm_batch'

  let latencyValue = 'Baseline Mode'
  let latencyCaption = 'Local heuristic (No AI active)'
  let latencyBadge = 'Non-AI'
  let latencyAlert = false

  if (isLLM) {
    if (llmMetrics?.status === 'halted') {
      latencyValue = 'HALTED'
      latencyCaption = llmMetrics.lastError || 'Failure threshold reached'
      latencyBadge = 'Error'
      latencyAlert = true
    } else if (llmMetrics?.status === 'uncontrolled') {
      latencyValue = `ERR (${llmMetrics.consecutiveFailures})`
      latencyCaption = llmMetrics.lastError || 'Decision request failed'
      latencyBadge = 'Degraded'
      latencyAlert = true
    } else if (
      llmMetrics?.lastProviderLatencyMs !== null &&
      llmMetrics?.lastProviderLatencyMs !== undefined
    ) {
      latencyValue = `${llmMetrics.lastProviderLatencyMs} ms`
      const skips = llmMetrics.skippedTicks > 0 ? ` | Skips: ${llmMetrics.skippedTicks}` : ''
      const avgStr = llmMetrics.avgProviderLatencyMs ? ` | Avg: ${llmMetrics.avgProviderLatencyMs}ms` : ''
      const tokStr =
        llmMetrics.lastInputTokens || llmMetrics.lastOutputTokens
          ? ` | Tok: ${llmMetrics.lastInputTokens ?? 0}in/${llmMetrics.lastOutputTokens ?? 0}out`
          : ''
      latencyCaption = `RT: ${llmMetrics.lastRoundTripMs ?? '—'}ms | Age: ${llmMetrics.decisionAgeMs ?? 0}ms${avgStr}${tokStr}${skips}`
      latencyBadge = (llmMetrics.clockPolicy || 'lockstep').toUpperCase()
      latencyAlert = false
    } else if (llmMetrics?.status === 'requesting') {
      latencyValue = 'In-Flight...'
      latencyCaption = 'Single-batch request processing'
      latencyBadge = 'API Active'
      latencyAlert = false
    } else {
      latencyValue = 'Ready'
      latencyCaption = 'Waiting for tick boundary (8-Key Pool)'
      latencyBadge = 'Compact AI'
      latencyAlert = false
    }
  }

  return (
    <section className="hud-panel" aria-label="Simulation Metrics">
      <div className="hud-panel__grid">
        <MetricCard
          label="Collisions"
          value={collisions}
          caption={
            collisions === 0 ? 'Zero collisions detected' : `${collisions} distinct contact events`
          }
          badge="Live SAT"
          isAlert={collisions > 0}
        />
        <MetricCard
          label="LLM Latency"
          value={latencyValue}
          caption={latencyCaption}
          badge={latencyBadge}
          isAlert={latencyAlert}
        />
        <MetricCard
          label="Vehicles Safely Cleared"
          value={clearedClean}
          caption={
            clearedTotal > 0
              ? `${clearedClean} clean of ${clearedTotal} total`
              : 'None reached exit yet'
          }
          badge="Real Data"
        />
        <MetricCard
          label="Active Vehicles"
          value={activeCount}
          caption={`${metrics?.waiting ?? 0} queued, ${metrics?.active ?? 0} moving`}
          badge="Real Data"
        />
      </div>
    </section>
  )
}
