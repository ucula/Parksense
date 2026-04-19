'use client'

import React, { useMemo, useState } from 'react'
import { API_BASE_URL } from '@/constants'

type Bucket = 'minute' | 'hour' | 'day'
type CountedFilter = 'ALL' | 'COUNTED' | 'UNCOUNTED'

interface DrilldownState {
  timestamp: string | null
  direction: string | null
  isCounted: boolean | null
  eventId: number | null
}

interface Filters {
  startTime: string
  endTime: string
  bucket: Bucket
  direction: string
  countedFilter: CountedFilter
  boardTempMin: string
  boardTempMax: string
  ultrasonicMin: string
  ultrasonicMax: string
  sharpMin: string
  sharpMax: string
  searchId: string
  limit: number
}

interface Kpis {
  total_events: number
  counted_events: number
  count_rate: number
  avg_ultrasonic_cm: number | null
  avg_sharp_cm: number | null
  avg_board_temp: number | null
}

interface EventCountBucket {
  timestamp: string
  total: number
  direction: Record<string, number>
}

interface CountedBucket {
  timestamp: string
  counted: number
  uncounted: number
}

interface CorrelationPoint {
  id: number
  timestamp: string
  ultrasonic_cm: number | null
  sharp_cm: number | null
  is_counted: boolean
  direction: string
}

interface EventRow {
  id: number
  timestamp: string
  direction: string
  raw_ultrasonic_us: number | null
  ultrasonic_cm: number | null
  raw_sharp_analog: number | null
  sharp_cm: number | null
  board_temp: number | null
  is_counted: boolean
}

interface DashboardData {
  kpis: Kpis
  direction_breakdown: Record<string, number>
  event_count_over_time: EventCountBucket[]
  counted_vs_uncounted_over_time: CountedBucket[]
  correlation_points: CorrelationPoint[]
  events: EventRow[]
}

const INITIAL_FILTERS: Filters = {
  startTime: '',
  endTime: '',
  bucket: 'hour',
  direction: 'ALL',
  countedFilter: 'ALL',
  boardTempMin: '',
  boardTempMax: '',
  ultrasonicMin: '',
  ultrasonicMax: '',
  sharpMin: '',
  sharpMax: '',
  searchId: '',
  limit: 500,
}

function formatDateInput(value: string): string | null {
  if (!value) {
    return null
  }
  return `${value.replace('T', ' ')}:00`
}

function toNumber(value: string): number | null {
  if (value.trim() === '') {
    return null
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function formatMetric(value: number | null, unit = ''): string {
  if (value === null || Number.isNaN(value)) {
    return '-'
  }
  return `${value.toFixed(2)}${unit}`
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function bucketTimestampString(timestamp: string, bucket: Bucket): string {
  const normalized = timestamp.replace('T', ' ').slice(0, 19)
  if (bucket === 'minute') {
    return `${normalized.slice(0, 16)}:00`
  }
  if (bucket === 'day') {
    return `${normalized.slice(0, 10)} 00:00:00`
  }
  return `${normalized.slice(0, 13)}:00:00`
}

function exportCsv(rows: EventRow[]): void {
  const headers = [
    'id',
    'timestamp',
    'direction',
    'raw_ultrasonic_us',
    'ultrasonic_cm',
    'raw_sharp_analog',
    'sharp_cm',
    'board_temp',
    'is_counted',
  ]

  const csvBody = rows
    .map((row) =>
      [
        row.id,
        row.timestamp,
        row.direction,
        row.raw_ultrasonic_us ?? '',
        row.ultrasonic_cm ?? '',
        row.raw_sharp_analog ?? '',
        row.sharp_cm ?? '',
        row.board_temp ?? '',
        row.is_counted ? 'true' : 'false',
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n')

  const csv = `${headers.join(',')}\n${csvBody}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `parking_events_${new Date().toISOString()}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function buildDashboardUrl(filters: Filters): string {
  const params = new URLSearchParams()
  params.set('bucket', filters.bucket)
  params.set('limit', String(filters.limit))

  const start = formatDateInput(filters.startTime)
  const end = formatDateInput(filters.endTime)

  if (start) {
    params.set('start_time', start)
  }
  if (end) {
    params.set('end_time', end)
  }
  if (filters.direction !== 'ALL') {
    params.set('direction', filters.direction)
  }
  if (filters.countedFilter === 'COUNTED') {
    params.set('is_counted', 'true')
  }
  if (filters.countedFilter === 'UNCOUNTED') {
    params.set('is_counted', 'false')
  }

  const boardTempMin = toNumber(filters.boardTempMin)
  const boardTempMax = toNumber(filters.boardTempMax)
  const ultrasonicMin = toNumber(filters.ultrasonicMin)
  const ultrasonicMax = toNumber(filters.ultrasonicMax)
  const sharpMin = toNumber(filters.sharpMin)
  const sharpMax = toNumber(filters.sharpMax)

  if (boardTempMin !== null) {
    params.set('board_temp_min', String(boardTempMin))
  }
  if (boardTempMax !== null) {
    params.set('board_temp_max', String(boardTempMax))
  }
  if (ultrasonicMin !== null) {
    params.set('ultrasonic_min', String(ultrasonicMin))
  }
  if (ultrasonicMax !== null) {
    params.set('ultrasonic_max', String(ultrasonicMax))
  }
  if (sharpMin !== null) {
    params.set('sharp_min', String(sharpMin))
  }
  if (sharpMax !== null) {
    params.set('sharp_max', String(sharpMax))
  }
  if (filters.searchId.trim()) {
    params.set('search_id', filters.searchId.trim())
  }

  return `${API_BASE_URL}/api/parking-events/dashboard?${params.toString()}`
}

function useDashboardData(appliedFilters: Filters): {
  data: DashboardData | null
  loading: boolean
  error: string | null
} {
  const [data, setData] = React.useState<DashboardData | null>(null)
  const [loading, setLoading] = React.useState<boolean>(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true

    async function fetchData(): Promise<void> {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(buildDashboardUrl(appliedFilters))
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload?.detail || 'Unable to fetch dashboard data')
        }

        if (active) {
          setData(payload as DashboardData)
        }
      } catch (fetchError) {
        if (active) {
          setError(fetchError instanceof Error ? fetchError.message : 'Unknown error')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      active = false
    }
  }, [appliedFilters])

  return { data, loading, error }
}

function KpiCard({ title, value }: { title: string; value: string }): React.ReactElement {
  return (
    <article style={styles.kpiCard}>
      <p style={styles.kpiTitle}>{title}</p>
      <p style={styles.kpiValue}>{value}</p>
    </article>
  )
}

function EventCountChart({
  buckets,
  selectedTimestamp,
  onSelectTimestamp,
}: {
  buckets: EventCountBucket[]
  selectedTimestamp: string | null
  onSelectTimestamp: (timestamp: string) => void
}): React.ReactElement {
  if (buckets.length === 0) {
    return <EmptyChartState label="No events in selected range" />
  }

  const width = 760
  const height = 250
  const padding = 30
  const chartWidth = width - padding * 2
  const chartHeight = height - padding * 2
  const maxY = Math.max(1, ...buckets.map((bucket) => bucket.total))

  const getX = (index: number) =>
    buckets.length === 1 ? padding + chartWidth / 2 : padding + (index / (buckets.length - 1)) * chartWidth

  const getY = (value: number) => padding + chartHeight - (value / maxY) * chartHeight

  const totalPath = buckets
    .map((bucket, index) => `${index === 0 ? 'M' : 'L'} ${getX(index)} ${getY(bucket.total)}`)
    .join(' ')

  const inPath = buckets
    .map((bucket, index) => `${index === 0 ? 'M' : 'L'} ${getX(index)} ${getY(bucket.direction.IN || 0)}`)
    .join(' ')

  const outPath = buckets
    .map((bucket, index) => `${index === 0 ? 'M' : 'L'} ${getX(index)} ${getY(bucket.direction.OUT || 0)}`)
    .join(' ')

  return (
    <div style={styles.chartWrap}>
      <svg viewBox={`0 0 ${width} ${height}`} style={styles.svgChart}>
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#8a6f52" strokeWidth="1" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#8a6f52" strokeWidth="1" />
        <path d={totalPath} fill="none" stroke="#254441" strokeWidth="3" />
        <path d={inPath} fill="none" stroke="#db5a42" strokeWidth="2" />
        <path d={outPath} fill="none" stroke="#f0a202" strokeWidth="2" />
        {buckets.map((bucket, index) => (
          <circle
            key={`${bucket.timestamp}-dot`}
            cx={getX(index)}
            cy={getY(bucket.total)}
            r={selectedTimestamp === bucket.timestamp ? 6 : 4}
            fill={selectedTimestamp === bucket.timestamp ? '#1d3124' : '#254441'}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelectTimestamp(bucket.timestamp)}
          >
            <title>{`${bucket.timestamp} | total ${bucket.total}`}</title>
          </circle>
        ))}
      </svg>
      <div style={styles.legendRow}>
        <span style={styles.legendItem}><i style={{ ...styles.legendDot, background: '#254441' }} />Total</span>
        <span style={styles.legendItem}><i style={{ ...styles.legendDot, background: '#db5a42' }} />IN</span>
        <span style={styles.legendItem}><i style={{ ...styles.legendDot, background: '#f0a202' }} />OUT</span>
      </div>
    </div>
  )
}

function CountedChart({
  buckets,
  selectedTimestamp,
  selectedCounted,
  onSelect,
}: {
  buckets: CountedBucket[]
  selectedTimestamp: string | null
  selectedCounted: boolean | null
  onSelect: (timestamp: string, isCounted: boolean) => void
}): React.ReactElement {
  if (buckets.length === 0) {
    return <EmptyChartState label="No counted breakdown available" />
  }

  const maxValue = Math.max(...buckets.map((bucket) => bucket.counted + bucket.uncounted), 1)
  const barWidth = `${Math.max(100 / buckets.length - 1.5, 1)}%`

  return (
    <div style={styles.stackedContainer}>
      {buckets.slice(-60).map((bucket) => {
        const total = bucket.counted + bucket.uncounted
        const countedHeight = total > 0 ? (bucket.counted / maxValue) * 100 : 0
        const uncountedHeight = total > 0 ? (bucket.uncounted / maxValue) * 100 : 0

        return (
          <div key={bucket.timestamp} style={{ ...styles.stackedBar, width: barWidth }} title={`${bucket.timestamp} | counted ${bucket.counted}, uncounted ${bucket.uncounted}`}>
            <button
              type="button"
              style={{
                ...styles.stackedSegmentButton,
                ...styles.uncountedSegment,
                height: `${uncountedHeight}%`,
                outline:
                  selectedTimestamp === bucket.timestamp && selectedCounted === false
                    ? '2px solid #1d3124'
                    : 'none',
              }}
              onClick={() => onSelect(bucket.timestamp, false)}
              aria-label={`Select uncounted events at ${bucket.timestamp}`}
            />
            <button
              type="button"
              style={{
                ...styles.stackedSegmentButton,
                ...styles.countedSegment,
                height: `${countedHeight}%`,
                outline:
                  selectedTimestamp === bucket.timestamp && selectedCounted === true
                    ? '2px solid #1d3124'
                    : 'none',
              }}
              onClick={() => onSelect(bucket.timestamp, true)}
              aria-label={`Select counted events at ${bucket.timestamp}`}
            />
          </div>
        )
      })}
      <div style={styles.legendRow}>
        <span style={styles.legendItem}><i style={{ ...styles.legendDot, background: '#2a9d8f' }} />Counted</span>
        <span style={styles.legendItem}><i style={{ ...styles.legendDot, background: '#e76f51' }} />Uncounted</span>
      </div>
    </div>
  )
}

function DirectionBreakdown({
  breakdown,
  selectedDirection,
  onSelectDirection,
}: {
  breakdown: Record<string, number>
  selectedDirection: string | null
  onSelectDirection: (direction: string) => void
}): React.ReactElement {
  const entries = Object.entries(breakdown)
  const total = entries.reduce((sum, [, count]) => sum + count, 0)

  if (entries.length === 0 || total === 0) {
    return <EmptyChartState label="No direction data" />
  }

  return (
    <div style={styles.breakdownList}>
      {entries.map(([direction, count]) => {
        const ratio = (count / total) * 100
        return (
          <div key={direction} style={styles.breakdownItem}>
            <div style={styles.breakdownLabelRow}>
              <span style={styles.breakdownLabel}>{direction}</span>
              <span style={styles.breakdownValue}>{count} ({ratio.toFixed(1)}%)</span>
            </div>
            <div style={styles.breakdownTrack}>
              <button
                type="button"
                style={{
                  ...styles.breakdownBar,
                  width: `${ratio}%`,
                  background: direction === 'IN' ? '#db5a42' : direction === 'OUT' ? '#f0a202' : '#6f4e37',
                  opacity: selectedDirection && selectedDirection !== direction ? 0.55 : 1,
                  border: selectedDirection === direction ? '2px solid #1d3124' : 'none',
                  cursor: 'pointer',
                }}
                onClick={() => onSelectDirection(direction)}
                aria-label={`Select direction ${direction}`}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CorrelationScatter({
  points,
  selectedEventId,
  onSelectPoint,
}: {
  points: CorrelationPoint[]
  selectedEventId: number | null
  onSelectPoint: (point: CorrelationPoint) => void
}): React.ReactElement {
  const validPoints = points
    .filter((point) => point.ultrasonic_cm !== null && point.sharp_cm !== null)
    .slice(0, 1200)

  if (validPoints.length === 0) {
    return <EmptyChartState label="No correlation points" />
  }

  const width = 760
  const height = 280
  const padding = 36

  const xValues = validPoints.map((point) => point.ultrasonic_cm as number)
  const yValues = validPoints.map((point) => point.sharp_cm as number)
  const minX = Math.min(...xValues)
  const maxX = Math.max(...xValues)
  const minY = Math.min(...yValues)
  const maxY = Math.max(...yValues)

  const safeXRange = Math.max(maxX - minX, 1)
  const safeYRange = Math.max(maxY - minY, 1)

  return (
    <div style={styles.chartWrap}>
      <svg viewBox={`0 0 ${width} ${height}`} style={styles.svgChart}>
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#8a6f52" strokeWidth="1" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#8a6f52" strokeWidth="1" />
        {validPoints.map((point) => {
          const x =
            padding + (((point.ultrasonic_cm as number) - minX) / safeXRange) * (width - padding * 2)
          const y =
            height -
            padding -
            (((point.sharp_cm as number) - minY) / safeYRange) * (height - padding * 2)

          return (
            <circle
              key={point.id}
              cx={x}
              cy={y}
              r={selectedEventId === point.id ? 4.4 : 2.8}
              fill={point.is_counted ? '#2a9d8f' : '#e76f51'}
              opacity={selectedEventId === point.id ? 1 : 0.75}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectPoint(point)}
            >
              <title>{`id ${point.id} | ${point.direction} | u:${point.ultrasonic_cm} s:${point.sharp_cm}`}</title>
            </circle>
          )
        })}
      </svg>
      <div style={styles.legendRow}>
        <span style={styles.legendItem}><i style={{ ...styles.legendDot, background: '#2a9d8f' }} />Counted</span>
        <span style={styles.legendItem}><i style={{ ...styles.legendDot, background: '#e76f51' }} />Uncounted</span>
      </div>
    </div>
  )
}

function EmptyChartState({ label }: { label: string }): React.ReactElement {
  return <div style={styles.emptyState}>{label}</div>
}

function EventTable({ rows }: { rows: EventRow[] }): React.ReactElement {
  if (rows.length === 0) {
    return <div style={styles.emptyState}>No events found for selected filters</div>
  }

  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Timestamp</th>
            <th style={styles.th}>Direction</th>
            <th style={styles.th}>Ultrasonic (cm)</th>
            <th style={styles.th}>Sharp (cm)</th>
            <th style={styles.th}>Raw US</th>
            <th style={styles.th}>Raw Sharp</th>
            <th style={styles.th}>Board Temp</th>
            <th style={styles.th}>Counted</th>
            <th style={styles.th}>ID</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td style={styles.td}>{new Date(row.timestamp).toLocaleString()}</td>
              <td style={styles.td}>{row.direction}</td>
              <td style={styles.td}>{row.ultrasonic_cm ?? '-'}</td>
              <td style={styles.td}>{row.sharp_cm ?? '-'}</td>
              <td style={styles.td}>{row.raw_ultrasonic_us ?? '-'}</td>
              <td style={styles.td}>{row.raw_sharp_analog ?? '-'}</td>
              <td style={styles.td}>{row.board_temp ?? '-'}</td>
              <td style={styles.td}>{row.is_counted ? 'true' : 'false'}</td>
              <td style={styles.td}>{row.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Home(): React.ReactElement {
  const [draftFilters, setDraftFilters] = useState<Filters>(INITIAL_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<Filters>(INITIAL_FILTERS)
  const [drilldown, setDrilldown] = useState<DrilldownState>({
    timestamp: null,
    direction: null,
    isCounted: null,
    eventId: null,
  })

  const { data, loading, error } = useDashboardData(appliedFilters)

  const sortedEvents = useMemo(() => {
    if (!data) {
      return []
    }
    return [...data.events].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [data])

  const tableEvents = useMemo(() => {
    return sortedEvents.filter((row) => {
      if (drilldown.eventId !== null && row.id !== drilldown.eventId) {
        return false
      }
      if (drilldown.timestamp && bucketTimestampString(row.timestamp, appliedFilters.bucket) !== drilldown.timestamp) {
        return false
      }
      if (drilldown.direction && row.direction !== drilldown.direction) {
        return false
      }
      if (drilldown.isCounted !== null && row.is_counted !== drilldown.isCounted) {
        return false
      }
      return true
    })
  }, [sortedEvents, drilldown, appliedFilters.bucket])

  const activeDrilldowns = useMemo(() => {
    const chips: string[] = []
    if (drilldown.timestamp) {
      chips.push(`Time: ${drilldown.timestamp}`)
    }
    if (drilldown.direction) {
      chips.push(`Direction: ${drilldown.direction}`)
    }
    if (drilldown.isCounted !== null) {
      chips.push(`Counted: ${drilldown.isCounted ? 'true' : 'false'}`)
    }
    if (drilldown.eventId !== null) {
      chips.push(`Event ID: ${drilldown.eventId}`)
    }
    return chips
  }, [drilldown])

  const entryVsExit = useMemo(() => {
    if (!data) {
      return 'IN 0 / OUT 0'
    }
    const entry = data.direction_breakdown.IN || 0
    const exit = data.direction_breakdown.OUT || 0
    return `IN ${entry} / OUT ${exit}`
  }, [data])

  return (
    <main style={styles.page}>
      <div style={styles.heroBackdrop} />
      <section style={styles.container}>
        <header style={styles.header}>
          <div>
            <p style={styles.eyebrow}>Sensor Event Intelligence Dashboard</p>
            <h1 style={styles.title}>Parking Events Monitor</h1>
            <p style={styles.subtitle}>
              Monitor event volume, counting behavior, and sensor consistency in one investigative workspace.
            </p>
          </div>
        </header>

        <section style={styles.panel}>
          <h2 style={styles.panelTitle}>Filters</h2>
          <div style={styles.filterGrid}>
            <label style={styles.label}>
              Start time
              <input
                type="datetime-local"
                value={draftFilters.startTime}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, startTime: event.target.value }))}
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              End time
              <input
                type="datetime-local"
                value={draftFilters.endTime}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, endTime: event.target.value }))}
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              Time bucket
              <select
                value={draftFilters.bucket}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, bucket: event.target.value as Bucket }))}
                style={styles.input}
              >
                <option value="minute">Minute</option>
                <option value="hour">Hour</option>
                <option value="day">Day</option>
              </select>
            </label>
            <label style={styles.label}>
              Direction
              <select
                value={draftFilters.direction}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, direction: event.target.value }))}
                style={styles.input}
              >
                <option value="ALL">All</option>
                <option value="IN">IN</option>
                <option value="OUT">OUT</option>
              </select>
            </label>
            <label style={styles.label}>
              Counted status
              <select
                value={draftFilters.countedFilter}
                onChange={(event) =>
                  setDraftFilters((prev) => ({ ...prev, countedFilter: event.target.value as CountedFilter }))
                }
                style={styles.input}
              >
                <option value="ALL">All</option>
                <option value="COUNTED">Counted only</option>
                <option value="UNCOUNTED">Uncounted only</option>
              </select>
            </label>
            <label style={styles.label}>
              Search ID
              <input
                type="text"
                placeholder="e.g. 1024"
                value={draftFilters.searchId}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchId: event.target.value }))}
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              Board temp min
              <input
                type="number"
                value={draftFilters.boardTempMin}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, boardTempMin: event.target.value }))}
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              Board temp max
              <input
                type="number"
                value={draftFilters.boardTempMax}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, boardTempMax: event.target.value }))}
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              Ultrasonic min (cm)
              <input
                type="number"
                value={draftFilters.ultrasonicMin}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, ultrasonicMin: event.target.value }))}
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              Ultrasonic max (cm)
              <input
                type="number"
                value={draftFilters.ultrasonicMax}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, ultrasonicMax: event.target.value }))}
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              Sharp min (cm)
              <input
                type="number"
                value={draftFilters.sharpMin}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, sharpMin: event.target.value }))}
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              Sharp max (cm)
              <input
                type="number"
                value={draftFilters.sharpMax}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, sharpMax: event.target.value }))}
                style={styles.input}
              />
            </label>
          </div>

          <div style={styles.filterActionRow}>
            <button
              type="button"
              style={styles.applyButton}
              onClick={() => {
                setAppliedFilters({ ...draftFilters })
                setDrilldown({ timestamp: null, direction: null, isCounted: null, eventId: null })
              }}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Apply filters'}
            </button>
            <button
              type="button"
              style={styles.resetButton}
              onClick={() => {
                setDraftFilters(INITIAL_FILTERS)
                setAppliedFilters(INITIAL_FILTERS)
                setDrilldown({ timestamp: null, direction: null, isCounted: null, eventId: null })
              }}
            >
              Reset
            </button>
            <button
              type="button"
              style={styles.exportButton}
              onClick={() => exportCsv(tableEvents)}
              disabled={tableEvents.length === 0}
            >
              Export CSV
            </button>
          </div>
        </section>

        {error ? <section style={styles.errorBox}>Error: {error}</section> : null}

        <section style={styles.kpiGrid}>
          <KpiCard title="Total Events" value={String(data?.kpis.total_events ?? 0)} />
          <KpiCard title="Counted Events" value={String(data?.kpis.counted_events ?? 0)} />
          <KpiCard title="Count Rate" value={formatPercent(data?.kpis.count_rate ?? 0)} />
          <KpiCard title="Entry vs Exit" value={entryVsExit} />
          <KpiCard title="Avg Ultrasonic" value={formatMetric(data?.kpis.avg_ultrasonic_cm ?? null, ' cm')} />
          <KpiCard title="Avg Sharp" value={formatMetric(data?.kpis.avg_sharp_cm ?? null, ' cm')} />
          <KpiCard title="Avg Board Temp" value={formatMetric(data?.kpis.avg_board_temp ?? null, ' °C')} />
        </section>

        <section style={styles.chartGrid}>
          <article style={styles.chartCard}>
            <h3 style={styles.chartTitle}>Event Count Over Time</h3>
            {loading ? <EmptyChartState label="Loading chart..." /> : <EventCountChart buckets={data?.event_count_over_time || []} selectedTimestamp={drilldown.timestamp} onSelectTimestamp={(timestamp) => setDrilldown((prev) => ({ ...prev, timestamp, eventId: null }))} />}
          </article>
          <article style={styles.chartCard}>
            <h3 style={styles.chartTitle}>Counted vs Uncounted Over Time</h3>
            {loading ? <EmptyChartState label="Loading chart..." /> : <CountedChart buckets={data?.counted_vs_uncounted_over_time || []} selectedTimestamp={drilldown.timestamp} selectedCounted={drilldown.isCounted} onSelect={(timestamp, isCounted) => setDrilldown((prev) => ({ ...prev, timestamp, isCounted, eventId: null }))} />}
          </article>
          <article style={styles.chartCard}>
            <h3 style={styles.chartTitle}>Direction Breakdown</h3>
            {loading ? <EmptyChartState label="Loading chart..." /> : <DirectionBreakdown breakdown={data?.direction_breakdown || {}} selectedDirection={drilldown.direction} onSelectDirection={(direction) => setDrilldown((prev) => ({ ...prev, direction, eventId: null }))} />}
          </article>
          <article style={styles.chartCardWide}>
            <h3 style={styles.chartTitle}>Ultrasonic vs Sharp Correlation</h3>
            {loading ? <EmptyChartState label="Loading chart..." /> : <CorrelationScatter points={data?.correlation_points || []} selectedEventId={drilldown.eventId} onSelectPoint={(point) => setDrilldown({ timestamp: bucketTimestampString(point.timestamp, appliedFilters.bucket), direction: point.direction, isCounted: point.is_counted, eventId: point.id })} />}
          </article>
        </section>

        <section style={styles.tablePanel}>
          <h2 style={styles.panelTitle}>Event Log Table</h2>
          <p style={styles.tableNote}>Sorted by timestamp desc. Click chart points/bars to drill down this table.</p>
          <div style={styles.drilldownActionRow}>
            <button
              type="button"
              style={styles.applyButton}
              onClick={() => setDrilldown((prev) => ({ ...prev, isCounted: false, eventId: null }))}
            >
              Show uncounted only
            </button>
            <button
              type="button"
              style={styles.resetButton}
              onClick={() => setDrilldown({ timestamp: null, direction: null, isCounted: null, eventId: null })}
            >
              Clear drilldown
            </button>
          </div>
          {activeDrilldowns.length > 0 ? (
            <div style={styles.drilldownChipRow}>
              {activeDrilldowns.map((chip) => (
                <span key={chip} style={styles.drilldownChip}>{chip}</span>
              ))}
            </div>
          ) : null}
          <EventTable rows={tableEvents} />
        </section>
      </section>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(125deg, #f6eee3 0%, #f1e1c6 35%, #e8cfa8 100%)',
    position: 'relative',
    overflow: 'hidden',
  },
  heroBackdrop: {
    position: 'absolute',
    top: -180,
    right: -120,
    width: 560,
    height: 560,
    borderRadius: '50%',
    background: 'radial-gradient(circle at center, rgba(219,90,66,0.22), rgba(219,90,66,0))',
    pointerEvents: 'none',
  },
  container: {
    width: 'min(1240px, 92vw)',
    margin: '0 auto',
    padding: '28px 0 64px 0',
    position: 'relative',
    zIndex: 1,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '18px',
  },
  eyebrow: {
    margin: 0,
    fontSize: '0.82rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#6f4e37',
    fontWeight: 700,
  },
  title: {
    margin: '8px 0 10px 0',
    color: '#1d3124',
    fontSize: 'clamp(1.8rem, 3.8vw, 3rem)',
    lineHeight: 1.05,
  },
  subtitle: {
    margin: 0,
    color: '#3e2f1f',
    maxWidth: '740px',
    lineHeight: 1.45,
  },
  panel: {
    background: 'rgba(255, 248, 238, 0.9)',
    border: '1px solid rgba(111,78,55,0.22)',
    borderRadius: '16px',
    padding: '16px',
    marginBottom: '14px',
    boxShadow: '0 10px 40px rgba(46,38,26,0.08)',
  },
  panelTitle: {
    margin: '0 0 12px 0',
    color: '#1d3124',
    fontSize: '1.1rem',
  },
  filterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: '10px',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '0.78rem',
    color: '#3e2f1f',
    fontWeight: 700,
  },
  input: {
    border: '1px solid #d4b98f',
    borderRadius: '10px',
    padding: '10px 11px',
    background: '#fffdf8',
    fontSize: '0.9rem',
    color: '#2a2118',
  },
  filterActionRow: {
    marginTop: '12px',
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  applyButton: {
    border: 'none',
    borderRadius: '10px',
    background: '#1d3124',
    color: '#fff',
    fontWeight: 700,
    padding: '10px 14px',
    cursor: 'pointer',
  },
  resetButton: {
    border: '1px solid #b98f69',
    borderRadius: '10px',
    background: '#fff4e8',
    color: '#59361a',
    fontWeight: 700,
    padding: '10px 14px',
    cursor: 'pointer',
  },
  exportButton: {
    border: 'none',
    borderRadius: '10px',
    background: '#db5a42',
    color: '#fff',
    fontWeight: 700,
    padding: '10px 14px',
    cursor: 'pointer',
  },
  errorBox: {
    background: '#fee2e2',
    border: '1px solid #ef4444',
    color: '#7f1d1d',
    padding: '12px',
    borderRadius: '12px',
    marginBottom: '12px',
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px',
    marginBottom: '14px',
  },
  kpiCard: {
    background: 'rgba(255, 252, 246, 0.95)',
    border: '1px solid rgba(111,78,55,0.2)',
    borderRadius: '14px',
    padding: '12px 14px',
  },
  kpiTitle: {
    margin: 0,
    color: '#6f4e37',
    fontSize: '0.8rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 700,
  },
  kpiValue: {
    margin: '8px 0 0 0',
    color: '#1d3124',
    fontSize: '1.35rem',
    fontWeight: 700,
    lineHeight: 1.1,
  },
  chartGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '10px',
    marginBottom: '14px',
  },
  chartCard: {
    background: '#fffbf4',
    border: '1px solid rgba(111,78,55,0.2)',
    borderRadius: '14px',
    padding: '12px',
    minHeight: '280px',
  },
  chartCardWide: {
    gridColumn: 'span 2',
    background: '#fffbf4',
    border: '1px solid rgba(111,78,55,0.2)',
    borderRadius: '14px',
    padding: '12px',
  },
  chartTitle: {
    margin: '0 0 10px 0',
    color: '#1d3124',
    fontSize: '1rem',
  },
  chartWrap: {
    width: '100%',
  },
  svgChart: {
    width: '100%',
    height: '220px',
    display: 'block',
  },
  legendRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: '8px',
    color: '#3e2f1f',
    fontSize: '0.82rem',
  },
  legendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  legendDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    display: 'inline-block',
  },
  stackedContainer: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '2px',
    minHeight: '210px',
    borderBottom: '1px solid #8a6f52',
    borderLeft: '1px solid #8a6f52',
    padding: '6px 4px 10px 6px',
    overflow: 'hidden',
  },
  stackedBar: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    height: '100%',
    minWidth: '4px',
  },
  stackedSegmentButton: {
    border: 'none',
    padding: 0,
    width: '100%',
    cursor: 'pointer',
    minHeight: '3px',
  },
  countedSegment: {
    background: '#2a9d8f',
    width: '100%',
  },
  uncountedSegment: {
    background: '#e76f51',
    width: '100%',
  },
  breakdownList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  breakdownItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  breakdownLabelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.86rem',
  },
  breakdownLabel: {
    color: '#1d3124',
    fontWeight: 700,
  },
  breakdownValue: {
    color: '#59361a',
  },
  breakdownTrack: {
    width: '100%',
    height: '14px',
    background: '#f2e6d4',
    borderRadius: '100px',
    overflow: 'hidden',
  },
  breakdownBar: {
    height: '100%',
  },
  emptyState: {
    border: '1px dashed #c7ac8b',
    borderRadius: '12px',
    background: '#fff8ed',
    color: '#7e6043',
    minHeight: '150px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
  },
  tablePanel: {
    background: '#fffbf4',
    border: '1px solid rgba(111,78,55,0.2)',
    borderRadius: '14px',
    padding: '12px',
  },
  tableNote: {
    margin: '0 0 8px 0',
    color: '#62462c',
    fontSize: '0.85rem',
  },
  drilldownActionRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '8px',
  },
  drilldownChipRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '8px',
  },
  drilldownChip: {
    background: '#f2e6d4',
    border: '1px solid #d4b98f',
    color: '#3e2f1f',
    borderRadius: '999px',
    padding: '5px 10px',
    fontSize: '0.8rem',
    fontWeight: 700,
  },
  tableWrap: {
    width: '100%',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '980px',
  },
  th: {
    textAlign: 'left',
    borderBottom: '1px solid #d5b793',
    color: '#2c2114',
    fontWeight: 700,
    padding: '10px 8px',
    fontSize: '0.84rem',
    background: '#f7ead8',
    position: 'sticky',
    top: 0,
  },
  td: {
    borderBottom: '1px solid #ebd9c2',
    color: '#2f2418',
    padding: '9px 8px',
    fontSize: '0.82rem',
    whiteSpace: 'nowrap',
  },
}
