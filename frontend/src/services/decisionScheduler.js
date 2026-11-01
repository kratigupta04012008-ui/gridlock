/**
 * GRID LOCK — Decision Scheduler & Clock Policy Orchestrator
 *
 * Implements two clock policies:
 * 1. lockstep: Pauses physics advancement while request is in-flight, resumes when decisions arrive.
 * 2. realtime: Physics advances at 50 Hz holding previous actions; in-flight collisions occur naturally;
 *              ticks arriving while request is in-flight are skipped and counted; decision age is tracked.
 *
 * Enforces:
 * - Single-flight requests (never concurrent).
 * - Strictly monotonic, unique tick IDs (never reused).
 * - Halts or marks uncontrolled after consecutive failures (default 3).
 * - Zero artificial fallback or synthetic safety clamping.
 */

export class DecisionScheduler {
  constructor({
    fetchDecisionsFn,
    onApplyActions,
    clockPolicy = 'lockstep',
    decisionIntervalSteps = 50, // 1.0 second at 50 Hz (50 steps of 0.02s)
    maxConsecutiveFailures = 3,
  }) {
    this.fetchDecisions = fetchDecisionsFn
    this.onApplyActions = onApplyActions
    this.clockPolicy = clockPolicy
    this.decisionIntervalSteps = decisionIntervalSteps
    this.maxConsecutiveFailures = maxConsecutiveFailures

    // State
    this.tickCounter = 0
    this.isRequestInFlight = false
    this.consecutiveFailures = 0
    this.skippedTicks = 0
    this.status = 'idle' // 'idle' | 'running' | 'requesting' | 'halted' | 'uncontrolled'
    this.lastError = null

    // Latency & Telemetry stats
    this.lastDecisions = null
    this.lastProviderLatencyMs = null
    this.lastRoundTripMs = null
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
    this.lastDecisionStep = 0
    this.lastDecisionSimTime = 0
    this.lastTriggeredStep = -1
    this.currentSimTime = 0
    this.decisionAgeMs = 0
  }

  /**
   * Called on every physics engine step (50 Hz).
   * Returns:
   *   { shouldStepEngine: boolean, requestTriggered: boolean }
   */
  checkStep(currentStep, currentSimTime, getActiveTelemetryFn) {
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
        // Lockstep waits
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
      this.lastError = null
      this.lastDecisions = response.decisions
      this.lastProviderLatencyMs = response.providerLatencyMs
      this.lastRoundTripMs = response.roundTripLatencyMs
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
    return {
      status: this.status,
      clockPolicy: this.clockPolicy,
      tickCounter: this.tickCounter,
      isRequestInFlight: this.isRequestInFlight,
      consecutiveFailures: this.consecutiveFailures,
      skippedTicks: this.skippedTicks,
      decisionAgeMs: Math.round(this.decisionAgeMs),
      lastProviderLatencyMs: this.lastProviderLatencyMs,
      lastRoundTripMs: this.lastRoundTripMs,
      lastError: this.lastError,
      lastDecisionStep: this.lastDecisionStep,
    }
  }
}
