/**
 * GRID LOCK — Decision Inspector & Audit Panel
 *
 * Displays live decisions returned by the LLM, decision age, provider latency,
 * and ledger invariants verifying 1-call-per-tick.
 */

import { useState, useEffect } from 'react'
import { fetchLedger } from '../services/decisionClient.js'

export function DecisionInspector({ schedulerMetrics, lastDecisions }) {
  const [isOpen, setIsOpen] = useState(false)
  const [ledgerData, setLedgerData] = useState(null)
  const [isLoadingLedger, setIsLoadingLedger] = useState(false)

  const handleRefreshLedger = async () => {
    setIsLoadingLedger(true)
    try {
      const data = await fetchLedger()
      setLedgerData(data)
    } catch {
      // Ignore if offline
    } finally {
      setIsLoadingLedger(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      handleRefreshLedger()
    }
  }, [isOpen])

  const decisionsList = lastDecisions || []

  return (
    <section className="inspector-panel decision-inspector" aria-label="LLM Decision Inspector">
      <div className="inspector-panel__header">
        <div className="inspector-panel__title-row">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <h3>Decision Inspector</h3>
          {schedulerMetrics?.status === 'running' && (
            <span className="badge badge--success" style={{ marginLeft: 'auto' }}>
              Active
            </span>
          )}
          {schedulerMetrics?.status === 'requesting' && (
            <span className="badge badge--notice" style={{ marginLeft: 'auto' }}>
              In Flight
            </span>
          )}
          {schedulerMetrics?.status === 'halted' && (
            <span className="badge badge--alert" style={{ marginLeft: 'auto' }}>
              HALTED
            </span>
          )}
          {schedulerMetrics?.status === 'uncontrolled' && (
            <span className="badge badge--alert" style={{ marginLeft: 'auto' }}>
              UNCONTROLLED
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn--sm btn--secondary"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
        >
          {isOpen ? 'Collapse' : 'Inspect Decisions'}
        </button>
      </div>

      {isOpen && (
        <div className="inspector-panel__body">
          {/* Latency & Invariant Summary */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
              marginBottom: '12px',
            }}
          >
            <div style={{ background: '#111827', padding: '8px', borderRadius: '4px' }}>
              <div style={{ fontSize: '10px', color: '#888' }}>Provider Latency</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#10b981' }}>
                {schedulerMetrics?.lastProviderLatencyMs !== null
                  ? `${schedulerMetrics.lastProviderLatencyMs} ms`
                  : '—'}
              </div>
            </div>
            <div style={{ background: '#111827', padding: '8px', borderRadius: '4px' }}>
              <div style={{ fontSize: '10px', color: '#888' }}>Round-Trip</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#38bdf8' }}>
                {schedulerMetrics?.lastRoundTripMs !== null
                  ? `${schedulerMetrics.lastRoundTripMs} ms`
                  : '—'}
              </div>
            </div>
            <div style={{ background: '#111827', padding: '8px', borderRadius: '4px' }}>
              <div style={{ fontSize: '10px', color: '#888' }}>Decision Age</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#f59e0b' }}>
                {schedulerMetrics?.decisionAgeMs !== undefined
                  ? `${schedulerMetrics.decisionAgeMs} ms`
                  : '—'}
              </div>
            </div>
          </div>

          {/* Decisions Table */}
          <div style={{ marginBottom: '12px' }}>
            <div
              style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#ccc' }}
            >
              Latest Batch Decisions ({decisionsList.length} vehicles)
            </div>
            {decisionsList.length > 0 ? (
              <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr
                      style={{ borderBottom: '1px solid #333', textAlign: 'left', color: '#888' }}
                    >
                      <th style={{ padding: '4px' }}>ID</th>
                      <th style={{ padding: '4px' }}>Action</th>
                      <th style={{ padding: '4px' }}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decisionsList.map((d) => (
                      <tr key={d.id} style={{ borderBottom: '1px solid #1f2937' }}>
                        <td style={{ padding: '4px' }}>Car #{d.id}</td>
                        <td style={{ padding: '4px' }}>
                          <span
                            style={{
                              color:
                                d.action === 'ACCELERATE'
                                  ? '#10b981'
                                  : d.action === 'BRAKE'
                                    ? '#ef4444'
                                    : '#f59e0b',
                              fontWeight: '600',
                            }}
                          >
                            {d.action}
                          </span>
                        </td>
                        <td style={{ padding: '4px', color: '#9ca3af' }}>
                          {d.action === 'ACCELERATE'
                            ? `throttle: ${d.throttle ?? '—'}`
                            : d.action === 'BRAKE'
                              ? `intensity: ${d.intensity ?? '—'}`
                              : '0.0'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ color: '#888', fontSize: '11px', fontStyle: 'italic' }}>
                No batch decisions received yet. Start the simulation with LLM controller active.
              </div>
            )}
          </div>

          {/* Transport Ledger Invariant Audit */}
          <div style={{ borderTop: '1px solid #374151', paddingTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#ccc' }}>
                Transport Ledger Audit
              </span>
              <button
                type="button"
                className="btn btn--sm btn--secondary"
                onClick={handleRefreshLedger}
                disabled={isLoadingLedger}
              >
                {isLoadingLedger ? 'Refreshing...' : 'Audit Ledger'}
              </button>
            </div>

            {ledgerData && (
              <div style={{ marginTop: '6px', fontSize: '11px', color: '#9ca3af' }}>
                <div>
                  Provider Calls: {ledgerData.providerRequestsAttempted} attempted (
                  {ledgerData.providerRequestsSucceeded} succeeded,{' '}
                  {ledgerData.providerRequestsFailed} failed)
                </div>
                <div
                  style={{
                    color: ledgerData.invariant_singleCallPerTickSatisfied ? '#10b981' : '#ef4444',
                  }}
                >
                  Max Calls / Tick: {ledgerData.invariant_maxProviderRequestsPerTick} (
                  {ledgerData.invariant_singleCallPerTickSatisfied
                    ? 'Strict Invariant Satisfied: <= 1'
                    : 'INVARIANT VIOLATION'}
                  )
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
