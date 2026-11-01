import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import App from '../App.jsx'

describe('Dashboard Component Smoke & Honesty Tests (Phase 4)', () => {
  it('renders the application header and Phase 4 LLM status badge', () => {
    render(<App />)

    expect(screen.getByText('GRID LOCK')).toBeInTheDocument()
    expect(screen.getByText('Phase 4: Single-Batch LLM Active')).toBeInTheDocument()
    expect(screen.getByText('Telemetry Payload (LLM Gate)')).toBeInTheDocument()
    expect(screen.getByText('Prompt Inspector')).toBeInTheDocument()
    expect(screen.getByText('Decision Inspector')).toBeInTheDocument()
  })

  it('renders HUD cards with live engine metrics adhering to honesty rules', () => {
    render(<App />)

    // Collisions
    expect(screen.getByText('Collisions')).toBeInTheDocument()
    expect(screen.getByText('Zero collisions detected')).toBeInTheDocument()

    // LLM Latency
    expect(screen.getByText('LLM Latency')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()

    // Vehicles safely cleared
    expect(screen.getByText('Vehicles Safely Cleared')).toBeInTheDocument()
    expect(screen.getByText('None reached exit yet')).toBeInTheDocument()

    // Active vehicles (dynamic real count from engine = 20)
    expect(screen.getByText('Active Vehicles')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
  })

  it('renders simulation controls with honest controller and clock policy selector', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: /start simulation/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reset simulation/i })).toBeInTheDocument()
    expect(screen.getByText('1 Batch Request / Tick (Strict)')).toBeInTheDocument()
    expect(screen.getByLabelText(/Clock Policy:/i)).toBeInTheDocument()
  })

  it('handles Start, Pause, and Reset interactions on the simulation', () => {
    render(<App />)

    const startBtn = screen.getByRole('button', { name: /start simulation/i })
    fireEvent.click(startBtn)

    // State changes to Running
    expect(screen.getByText(/Running \(Clock only\)/i)).toBeInTheDocument()

    // Button transitions to Pause
    const pauseBtn = screen.getByRole('button', { name: /pause simulation/i })
    expect(pauseBtn).toBeInTheDocument()
    fireEvent.click(pauseBtn)

    // State changes to Paused
    expect(screen.getByText('Paused')).toBeInTheDocument()

    // Reset button returns status to Idle
    const resetBtn = screen.getByRole('button', { name: /reset simulation/i })
    fireEvent.click(resetBtn)
    expect(screen.getByText('Idle')).toBeInTheDocument()
  })

  it('renders traffic signal state machine with live cycle phase', () => {
    render(<App />)

    expect(screen.getByText('Traffic Signals')).toBeInTheDocument()
    expect(screen.getByText('State Machine (34s Cycle)')).toBeInTheDocument()
  })

  it('renders scenario selector as a clearly labeled disabled placeholder', () => {
    render(<App />)

    expect(screen.getByText('Placeholder — Not implemented')).toBeInTheDocument()
    const select = screen.getByTitle('Scenarios are not implemented in Phase 1')
    expect(select).toBeDisabled()
  })
})
