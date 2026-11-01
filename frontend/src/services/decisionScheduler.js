/**
 * GRID LOCK — Decision Scheduler & Clock Policy Orchestrator
 *
 * Implements Phase 4 timing and concurrency rules:
 * 1. Exactly ONE batch decision request per decision tick (default every 50 steps = 1.0s, configurable).
 * 2. Concurrency limit = 1 (no overlapping requests).
 * 3. Dual Clock Policies:
 *    - 'lockstep': Simulation clock freezes while request is in-flight (benchmark evaluation).
 *    - 'realtime': Simulation clock advances at 50 Hz. If response arrives late, applies freshly.
 * 4. Tracks decision age and consecutive failure thresholds.
 * 5. Collects rolling token usage (input/output) and latency metrics.
 */

import { fetchDecisions } from './decisionClient.js'

export class DecisionScheduler {
  constructor(options = {}) {
    this.decisionIntervalSteps = options.decisionIntervalSteps || 50 // 50 steps = 1.0s at 50 Hz
    this.clockPolicy = options.clockPolicy || 'lockstep' // 'lockstep' | 'realtime'
    this.maxConsecutiveFailures = options.maxConsecutiveFailures || 3
    this.onApplyActions = options.onApplyActions || null
    this.fetchDecisions = options.fetchDecisionsFn || options.fetchDecisions || fetchDecisions

    // State
    this.tickCounter = 0
    this.isRequestInFlight = false
    this.consecutiveFailures = 0
    this.skippedTicks = 0
    this.status = 'idle' // 'idle' | 'running' | 'requesting' | 'halted' | 'uncontrolled'
    this.lastError = null

    // Latency & Token stats
    this.lastDecisions = null
    this.lastProviderLatencyMs = null
    this.lastRoundTripMs = null
    this.maxProviderLatencyMs = null
    this.lastInputTokens = null
    this.lastOutputTokens = null
    this.totalRequests = 0
    this.successfulRequests = 0
    this._recentLatencies = []
    this._recentInputTokens = []
    this._recentOutputTokens = []

    this.lastDecisionStep = 0
    this.lastDecisionSimTime = 0
    this.lastTriggeredStep = -1
    this.currentSimTime = 0
    this.decisionAgeMs = 0

    // Abort controller for current request
    this._abortController = null
  }

  setClockPolicy(policy) {
    if (policy === 'lockstep' || policy === 'realtime') {
      this.clockPolicy = policy
    }
  }

  setDecisionIntervalSteps(steps) {
    if (steps > 0) {
      this.decisionIntervalSteps = steps
    }
  }

  reset() {
    if (this._abortController) {
      this._abortController.abort()
      this._abortController = null
    }
    // Maintain monotonic tick sequence across resets so tick IDs are never reused
    this.isRequestInFlight = false
    this.consecutiveFailures = 0
    this.skippedTicks = 0
    this.status = 'idle'
    this.lastError = null
    this.lastDecisions = null
    this.lastProviderLatencyMs = null
    this.lastRoundTripMs = null
    this.lastInputTokens = null
    this.lastOutputTokens = null
    this.lastDecisionStep = 0
    this.lastDecisionSimTime = 0
    this.lastTriggeredStep = -1
    this.currentSimTime = 0
    this.decisionAgeMs = 0
  }

  checkStep(currentStep, currentSimTime, getActiveTelemetryFn) {
    return this.step(currentStep, currentSimTime, getActiveTelemetryFn)
  }

  step(currentStep, currentSimTime, getActiveTelemetryFn) {
    this.currentSimTime = currentSimTime
    this.decisionAgeMs = Math.max(0, (currentSimTime - this.lastDecisionSimTime) * 1000)

    if (this.status === 'halted') {
      return { shouldStepEngine: false, requestTriggered: false }
    }

    // In lockstep mode, if a request is in flight, freeze the engine
    if (this.clockPolicy === 'lockstep' && this.isRequestInFlight) {
      return { shouldStepEngine: false, requestTriggered: false }
    }

    // If a decision request was already triggered for this exact step boundary, allow stepping
    if (this.lastTriggeredStep === currentStep) {
      return { shouldStepEngine: true, requestTriggered: false }
    }

    // Check if this step is on a decision interval boundary
    const isBoundary = currentStep > 0 && currentStep % this.decisionIntervalSteps === 0
    if (!isBoundary) {
      return { shouldStepEngine: true, requestTriggered: false }
    }

    // If a request is already in-flight:
    if (this.isRequestInFlight) {
      if (this.clockPolicy === 'realtime') {
        this.skippedTicks++
        return { shouldStepEngine: true, requestTriggered: false }
      } else {
        // Lockstep waits for provider response
        return { shouldStepEngine: false, requestTriggered: false }
      }
    }

    // Trigger new batch decision request
    const telemetry = getActiveTelemetryFn()
    if (!telemetry || telemetry.length === 0) {
      return { shouldStepEngine: true, requestTriggered: false }
    }

    this.lastTriggeredStep = currentStep
    this.triggerDecisionRequest(telemetry, currentStep, currentSimTime)
    const canStep = this.clockPolicy !== 'lockstep'
    return { shouldStepEngine: canStep, requestTriggered: true }
  }

  async triggerDecisionRequest(telemetry, currentStep, currentSimTime) {
    this.tickCounter++
    const currentTickId = this.tickCounter
    this.isRequestInFlight = true
    this.totalRequests++
    this.status = 'requesting'
    this._abortController = new AbortController()

    try {
      const response = await this.fetchDecisions({
        tickId: currentTickId,
        telemetry,
        signal: this._abortController.signal,
      })

      // Success! Reset failure count
      this.consecutiveFailures = 0
      this.successfulRequests++
      this.lastError = null
      this.lastDecisions = response.decisions
      this.lastProviderLatencyMs = response.providerLatencyMs
      this.lastRoundTripMs = response.roundTripLatencyMs
      this.lastInputTokens = response.inputTokens || null
      this.lastOutputTokens = response.outputTokens || null

      if (response.providerLatencyMs != null) {
        this._recentLatencies.push(response.providerLatencyMs)
        if (this._recentLatencies.length > 50) this._recentLatencies.shift()
        if (
          this.maxProviderLatencyMs === null ||
          response.providerLatencyMs > this.maxProviderLatencyMs
        ) {
          this.maxProviderLatencyMs = response.providerLatencyMs
        }
      }

      if (response.inputTokens) {
        this._recentInputTokens.push(response.inputTokens)
        if (this._recentInputTokens.length > 50) this._recentInputTokens.shift()
      }
      if (response.outputTokens) {
        this._recentOutputTokens.push(response.outputTokens)
        if (this._recentOutputTokens.length > 50) this._recentOutputTokens.shift()
      }

      this.lastDecisionStep = currentStep
      this.lastDecisionSimTime = currentSimTime
      this.decisionAgeMs = 0
      this.status = 'running'

      // Apply decisions to engine
      if (this.onApplyActions) {
        this.onApplyActions(response.decisions)
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        return
      }

      this.consecutiveFailures++
      this.lastError = err.message || 'Unknown decision error'

      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        this.status = 'halted'
      } else {
        this.status = 'uncontrolled'
      }
    } finally {
      this.isRequestInFlight = false
      this._abortController = null
    }
  }

  getMetrics() {
    const avgLat =
      this._recentLatencies.length > 0
        ? Math.round(
            this._recentLatencies.reduce((a, b) => a + b, 0) / this._recentLatencies.length
          )
        : null

    const avgInTok =
      this._recentInputTokens.length > 0
        ? Math.round(
            this._recentInputTokens.reduce((a, b) => a + b, 0) / this._recentInputTokens.length
          )
        : null

    const avgOutTok =
      this._recentOutputTokens.length > 0
        ? Math.round(
            this._recentOutputTokens.reduce((a, b) => a + b, 0) / this._recentOutputTokens.length
          )
        : null

    return {
      status: this.status,
      clockPolicy: this.clockPolicy,
      decisionIntervalSteps: this.decisionIntervalSteps,
      tickCounter: this.tickCounter,
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      isRequestInFlight: this.isRequestInFlight,
      consecutiveFailures: this.consecutiveFailures,
      skippedTicks: this.skippedTicks,
      decisionAgeMs: Math.round(this.decisionAgeMs),
      lastProviderLatencyMs: this.lastProviderLatencyMs,
      avgProviderLatencyMs: avgLat,
      maxProviderLatencyMs: this.maxProviderLatencyMs,
      lastRoundTripMs: this.lastRoundTripMs,
      lastInputTokens: this.lastInputTokens,
      avgInputTokens: avgInTok,
      lastOutputTokens: this.lastOutputTokens,
      avgOutputTokens: avgOutTok,
      lastError: this.lastError,
      lastDecisionStep: this.lastDecisionStep,
    }
  }
}
