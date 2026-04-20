'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE_URL, PARKING_CAPACITY, COLORS, OCC_THRESHOLDS, occColor } from '@/constants'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Bucket = 'minute' | 'hour' | 'day'
type DirectionFilter = 'ALL' | 'IN' | 'OUT' | 'FLAT'
type RainFilter = 'ALL' | 'RAIN' | 'DRY'
type ActiveTab = 'live' | 'analytics' | 'diagnostics'
type SeverityFilter = 'ALL' | 'MEDIUM' | 'LOW'
type TimeRangeFilter = '24h' | '7d' | 'all'

const FULL_TABLE_PAGE_SIZE = 30

interface Filters {
  startTime: string
  endTime: string
  bucket: Bucket
  directionView: DirectionFilter
  rainFilter: RainFilter
  boardTempMin: string
  boardTempMax: string
  ultrasonicInMin: string
  ultrasonicInMax: string
  ultrasonicOutMin: string
  ultrasonicOutMax: string
  lidarInMin: string
  lidarInMax: string
  lidarOutMin: string
  lidarOutMax: string
  searchId: string
  limit: number
  offset: number
}

interface AnomalyThresholds {
  sensorGapIn: string
  sensorGapOut: string
  occupancyChange: string
}

interface DrilldownState {
  bucketTimestamp: string | null
  directionView: string | null
  isRaining: boolean | null
  rowId: number | null
}

interface DashboardKpis {
  total_logs: number
  current_vehicles_latest: number
  avg_parking_percentage: number | null
  total_in: number
  total_out: number
  latest_net_flow: number
  rain_ratio: number
  avg_board_temperature: number | null
}

interface TrendPoint {
  timestamp: string
  rows: number
  current_vehicles: number | null
  parking_percentage: number | null
  in_count: number
  out_count: number
  net_flow: number
  api_temperature: number | null
  api_feels_like: number | null
  api_humidity: number | null
  api_clouds: number | null
  board_temperature: number | null
  ultrasonic_in_cm: number | null
  lidar_in_cm: number | null
  pir_in_trigger: number
  ultrasonic_out_cm: number | null
  lidar_out_cm: number | null
  pir_out_trigger: number
  rain_ratio: number
}

interface TempParkingPoint {
  id: number
  timestamp: string
  api_temperature: number | null
  parking_percentage: number | null
  is_raining: boolean
}

interface RawConvertedPoint {
  id: number
  timestamp: string
  raw: number
  converted: number
}

interface BoardTempSensorPoint {
  id: number
  timestamp: string
  board_temperature: number
  ultrasonic_in_cm: number | null
  ultrasonic_out_cm: number | null
  lidar_in_cm: number | null
  lidar_out_cm: number | null
}

interface CorrelationPair {
  x: string
  y: string
  value: number | null
}

interface CorrelationMatrix {
  metrics: string[]
  pairs: CorrelationPair[]
}

interface AnomalyFlag {
  id: number
  timestamp: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  reasons: string[]
  direction: string
  direction_view: string
  current_vehicles: number
  parking_percentage: number | null
  net_flow: number
  sensor_gap_in: number | null
  sensor_gap_out: number | null
}

interface SensorBaselines {
  sensor_gap_in: { p50: number | null; p95: number | null }
  sensor_gap_out: { p50: number | null; p95: number | null }
  occupancy_change_abs: { p95: number | null }
}

interface ParkingLogRow {
  id: number
  timestamp: string
  in_count: number
  out_count: number
  net_flow: number
  current_vehicles: number
  parking_percentage: number | null
  api_feels_like: number | null
  api_humidity: number | null
  api_clouds: number | null
  api_temperature: number | null
  board_temperature: number | null
  is_raining: boolean
  pir_in_trigger: number
  raw_ultrasonic_in_us: number | null
  ultrasonic_in_cm: number | null
  raw_lidar_in_analog: number | null
  pir_out_trigger: number
  raw_ultrasonic_out_us: number | null
  ultrasonic_out_cm: number | null
  raw_lidar_out_analog: number | null
  lidar_in_cm: number | null
  lidar_out_cm: number | null
  direction_view: string
  occupancy_change: number | null
  in_out_ratio: number
  sensor_gap_in: number | null
  sensor_gap_out: number | null
}

interface DashboardData {
  source: string
  kpis: DashboardKpis
  direction_breakdown: Record<string, number>
  trends: TrendPoint[]
  rain_vs_occupancy: {
    raining_logs: number
    dry_logs: number
    raining_avg_current_vehicles: number | null
    dry_avg_current_vehicles: number | null
  }
  temp_vs_parking_scatter: TempParkingPoint[]
  raw_vs_converted_checks: {
    ultrasonic_in: RawConvertedPoint[]
    ultrasonic_out: RawConvertedPoint[]
    lidar_in: RawConvertedPoint[]
    lidar_out: RawConvertedPoint[]
  }
  board_temp_sensor_scatter: BoardTempSensorPoint[]
  sensor_baselines: SensorBaselines
  anomaly_flags: AnomalyFlag[]
  correlation_matrix: CorrelationMatrix
  logs: ParkingLogRow[]
  total_filtered_logs: number
  returned_logs: number
}

interface PredictionResult {
  model_available: boolean
  predicted_pct?: number
  current_pct?: number
  delta?: number
  direction?: 'UP' | 'DOWN' | 'FLAT'
  predicted_vehicles?: number
  is_near_full?: boolean
  error?: string
}

interface HeatmapCell {
  day: string
  hour: number
  avg_pct: number | null
  count: number
}

interface HeatmapData {
  cells: HeatmapCell[]
  days: string[]
  hours: number[]
}

interface DailySummary {
  date: string
  avg_pct: number | null
  max_pct: number | null
  total_in: number
  total_out: number
  sparkline: (number | null)[]
}

interface DayOfWeekStat {
  day: string
  avg_pct: number | null
  count: number
}

interface TempBucket {
  temp_range: string
  temp_floor: number
  avg_pct: number
  std: number
  count: number
}

interface AnalyticsData {
  prediction: PredictionResult | null
  heatmap: HeatmapData | null
  daily_summary: DailySummary[]
  day_of_week: { days: DayOfWeekStat[]; overall_avg: number | null } | null
  temp_buckets: TempBucket[]
}

interface SensorHealthEntry {
  active_rate: number
  avg_when_active: number | null
  status: 'OK' | 'WARN' | 'CRITICAL'
}

type SensorHealthData = Record<string, SensorHealthEntry>

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const INITIAL_FILTERS: Filters = {
  startTime: '',
  endTime: '',
  bucket: 'hour',
  directionView: 'ALL',
  rainFilter: 'ALL',
  boardTempMin: '',
  boardTempMax: '',
  ultrasonicInMin: '',
  ultrasonicInMax: '',
  ultrasonicOutMin: '',
  ultrasonicOutMax: '',
  lidarInMin: '',
  lidarInMax: '',
  lidarOutMin: '',
  lidarOutMax: '',
  searchId: '',
  limit: 5000,
  offset: 0,
}

const INITIAL_THRESHOLDS: AnomalyThresholds = {
  sensorGapIn: '114.43',
  sensorGapOut: '114.00',
  occupancyChange: '4.00',
}

const REASON_LABELS: Record<string, string> = {
  occupancy_jump: 'Sudden large change in vehicle count',
  sensor_gap_in_outlier: 'Unusually long gap between inbound sensor readings',
  sensor_gap_out_outlier: 'Unusually long gap between outbound sensor readings',
  net_flow_mismatch: 'Net flow does not match in_count − out_count',
  parking_percentage_out_of_range: 'Parking percentage is outside 0–100%',
  current_vehicles_negative: 'Current vehicle count is negative',
}

const TABLE_COLUMNS: Array<{ key: keyof ParkingLogRow; label: string; kind?: 'datetime' | 'bool' | 'float' }> = [
  { key: 'id', label: 'id' },
  { key: 'timestamp', label: 'timestamp', kind: 'datetime' },
  { key: 'in_count', label: 'in_count' },
  { key: 'out_count', label: 'out_count' },
  { key: 'net_flow', label: 'net_flow' },
  { key: 'current_vehicles', label: 'current_vehicles' },
  { key: 'parking_percentage', label: 'parking_percentage', kind: 'float' },
  { key: 'api_feels_like', label: 'api_feels_like', kind: 'float' },
  { key: 'api_humidity', label: 'api_humidity', kind: 'float' },
  { key: 'api_clouds', label: 'api_clouds', kind: 'float' },
  { key: 'api_temperature', label: 'api_temperature', kind: 'float' },
  { key: 'board_temperature', label: 'board_temperature', kind: 'float' },
  { key: 'is_raining', label: 'is_raining', kind: 'bool' },
  { key: 'pir_in_trigger', label: 'pir_in_trigger' },
  { key: 'raw_ultrasonic_in_us', label: 'raw_ultrasonic_in_us', kind: 'float' },
  { key: 'ultrasonic_in_cm', label: 'ultrasonic_in_cm', kind: 'float' },
  { key: 'raw_lidar_in_analog', label: 'raw_lidar_in_analog', kind: 'float' },
  { key: 'pir_out_trigger', label: 'pir_out_trigger' },
  { key: 'raw_ultrasonic_out_us', label: 'raw_ultrasonic_out_us', kind: 'float' },
  { key: 'ultrasonic_out_cm', label: 'ultrasonic_out_cm', kind: 'float' },
  { key: 'raw_lidar_out_analog', label: 'raw_lidar_out_analog', kind: 'float' },
  { key: 'lidar_in_cm', label: 'lidar_in_cm', kind: 'float' },
  { key: 'lidar_out_cm', label: 'lidar_out_cm', kind: 'float' },
  { key: 'direction_view', label: 'direction' },
  { key: 'occupancy_change', label: 'occupancy_change', kind: 'float' },
  { key: 'in_out_ratio', label: 'in_out_ratio', kind: 'float' },
  { key: 'sensor_gap_in', label: 'sensor_gap_in', kind: 'float' },
  { key: 'sensor_gap_out', label: 'sensor_gap_out', kind: 'float' },
]

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function toNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatDateInput(value: string): string | null {
  if (!value) return null
  return `${value.replace('T', ' ')}:00`
}

function formatNumber(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return '-'
  return value.toFixed(digits)
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).replace(',', '')
}

function formatCellValue(column: (typeof TABLE_COLUMNS)[number], value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (column.kind === 'datetime') {
    const date = new Date(String(value))
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
  }
  if (column.kind === 'bool') return value ? 'true' : 'false'
  if (column.kind === 'float') {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric.toFixed(2) : String(value)
  }
  return String(value)
}

function bucketTimestampString(timestamp: string, bucket: Bucket): string {
  const normalized = timestamp.replace('T', ' ').slice(0, 19)
  if (bucket === 'minute') return `${normalized.slice(0, 16)}:00`
  if (bucket === 'day') return `${normalized.slice(0, 10)} 00:00:00`
  return `${normalized.slice(0, 13)}:00:00`
}

function exportCsv(rows: ParkingLogRow[]): void {
  const headers = TABLE_COLUMNS.map((c) => c.label)
  const body = rows
    .map((row) =>
      TABLE_COLUMNS.map((c) => `"${String(formatCellValue(c, row[c.key])).replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n')
  const csv = `${headers.join(',')}\n${body}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `parking_logs_${new Date().toISOString()}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function exportObjectRowsAsCsv(rows: Array<Record<string, unknown>>, fileName: string): void {
  if (rows.length === 0) return
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
  const body = rows
    .map((r) => headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const csv = `${headers.join(',')}\n${body}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ─────────────────────────────────────────────────────────────
// URL builders
// ─────────────────────────────────────────────────────────────

function buildDashboardUrl(filters: Filters, thresholds: AnomalyThresholds): string {
  const params = new URLSearchParams()
  params.set('bucket', filters.bucket)
  params.set('offset', String(filters.offset))
  params.set('sort', 'asc')

  const start = formatDateInput(filters.startTime)
  const end = formatDateInput(filters.endTime)
  if (start) params.set('start_time', start)
  if (end) params.set('end_time', end)
  if (filters.directionView !== 'ALL') params.set('direction_view', filters.directionView)
  if (filters.rainFilter === 'RAIN') params.set('is_raining', 'true')
  if (filters.rainFilter === 'DRY') params.set('is_raining', 'false')

  const nums: Array<[string, string]> = [
    ['board_temperature_min', filters.boardTempMin],
    ['board_temperature_max', filters.boardTempMax],
    ['ultrasonic_in_min', filters.ultrasonicInMin],
    ['ultrasonic_in_max', filters.ultrasonicInMax],
    ['ultrasonic_out_min', filters.ultrasonicOutMin],
    ['ultrasonic_out_max', filters.ultrasonicOutMax],
    ['lidar_in_min', filters.lidarInMin],
    ['lidar_in_max', filters.lidarInMax],
    ['lidar_out_min', filters.lidarOutMin],
    ['lidar_out_max', filters.lidarOutMax],
  ]
  for (const [key, val] of nums) {
    const n = toNumber(val)
    if (n !== null) params.set(key, String(n))
  }
  if (filters.searchId.trim()) params.set('search_id', filters.searchId.trim())

  const gapIn = toNumber(thresholds.sensorGapIn)
  const gapOut = toNumber(thresholds.sensorGapOut)
  const occCh = toNumber(thresholds.occupancyChange)
  if (gapIn !== null) params.set('anomaly_gap_in', String(gapIn))
  if (gapOut !== null) params.set('anomaly_gap_out', String(gapOut))
  if (occCh !== null) params.set('anomaly_occ_change', String(occCh))

  return `${API_BASE_URL}/api/park-logs/dashboard?${params.toString()}`
}

function buildReportUrl(filters: Filters, preset: 'daily' | 'weekly'): string {
  const params = new URLSearchParams()
  params.set('preset', preset)
  const start = formatDateInput(filters.startTime)
  const end = formatDateInput(filters.endTime)
  if (start) params.set('start_time', start)
  if (end) params.set('end_time', end)
  return `${API_BASE_URL}/api/park-logs/reports?${params.toString()}`
}

// ─────────────────────────────────────────────────────────────
// API hooks
// ─────────────────────────────────────────────────────────────

function useDashboardData(appliedFilters: Filters, thresholds: AnomalyThresholds, refreshKey: number) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(buildDashboardUrl(appliedFilters, thresholds))
        const payload = await response.json()
        if (!response.ok) throw new Error(payload?.detail || 'Unable to fetch dashboard data')
        if (active) setData(payload as DashboardData)
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchData()
    return () => { active = false }
  }, [appliedFilters, thresholds, refreshKey])

  return { data, loading, error }
}

function useAnalyticsData() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetch(`${API_BASE_URL}/api/park-logs/analytics`)
      .then((r) => r.json())
      .then((payload) => { if (active) setAnalyticsData(payload) })
      .catch(() => { if (active) setAnalyticsData(null) })
      .finally(() => { if (active) setAnalyticsLoading(false) })
    return () => { active = false }
  }, [])

  return { analyticsData, analyticsLoading }
}

function useSensorHealth() {
  const [sensorHealth, setSensorHealth] = useState<SensorHealthData | null>(null)
  const [sensorLoading, setSensorLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetch(`${API_BASE_URL}/api/park-logs/sensor-health`)
      .then((r) => r.json())
      .then((payload) => { if (active) setSensorHealth(payload) })
      .catch(() => { if (active) setSensorHealth(null) })
      .finally(() => { if (active) setSensorLoading(false) })
    return () => { active = false }
  }, [])

  return { sensorHealth, sensorLoading }
}

// ─────────────────────────────────────────────────────────────
// Utility components
// ─────────────────────────────────────────────────────────────

function EmptyChartState({ label }: { label: string }): React.ReactElement {
  return <div style={styles.emptyState}>{label}</div>
}

function KpiCard({ title, value, sub, color }: { title: string; value: string; sub?: string; color?: string }): React.ReactElement {
  return (
    <article style={styles.kpiCard}>
      <p style={styles.kpiTitle}>{title}</p>
      <p style={{ ...styles.kpiValue, ...(color ? { color } : {}) }}>{value}</p>
      {sub && <p style={styles.kpiSub}>{sub}</p>}
    </article>
  )
}

function MlPredictionCard({ pred }: { pred: PredictionResult | null | undefined }): React.ReactElement {
  if (!pred) {
    return (
      <article style={styles.kpiCard}>
        <p style={styles.kpiTitle}>Predicted (30 min)</p>
        <p style={styles.kpiValueMuted}>Loading…</p>
      </article>
    )
  }
  if (!pred.model_available) {
    return (
      <article style={styles.kpiCard}>
        <p style={styles.kpiTitle}>Predicted (30 min)</p>
        <p style={styles.kpiValueMuted}>Model unavailable</p>
        {pred.error && <p style={{ ...styles.kpiSub, color: COLORS.critical, fontSize: '0.7rem', wordBreak: 'break-all' }}>{pred.error}</p>}
      </article>
    )
  }

  const arrow = pred.direction === 'UP' ? '↑' : pred.direction === 'DOWN' ? '↓' : '→'
  const deltaColor = pred.direction === 'UP' ? COLORS.critical : pred.direction === 'DOWN' ? COLORS.primary : '#888'
  const pctColor = occColor(pred.predicted_pct ?? 0)

  return (
    <article style={styles.kpiCard}>
      <p style={styles.kpiTitle}>Predicted (30 min)</p>
      <p style={{ ...styles.kpiValue, color: pctColor }}>
        {formatNumber(pred.predicted_pct ?? null)}%{' '}
        <span style={{ color: deltaColor, fontSize: '1rem' }}>{arrow} {pred.delta !== undefined && pred.delta >= 0 ? '+' : ''}{formatNumber(pred.delta ?? null)}%</span>
      </p>
      <p style={styles.kpiSub}>~{pred.predicted_vehicles} vehicles</p>
      {pred.is_near_full && (
        <p style={{ color: COLORS.critical, fontWeight: 700, fontSize: '0.78rem', marginTop: 4 }}>
          ⚠ {(pred.predicted_pct ?? 0) >= 95 ? 'Full capacity risk' : 'Approaching capacity'}
        </p>
      )}
    </article>
  )
}

// ─────────────────────────────────────────────────────────────
// Anomaly Banner
// ─────────────────────────────────────────────────────────────

interface BannerState { show: boolean; total?: number; medium?: number; low?: number; level?: 'amber' | 'red' }

function computeBannerState(flags: AnomalyFlag[]): BannerState {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const recent = flags.filter((f) => new Date(f.timestamp).getTime() >= cutoff)
  if (recent.length === 0) return { show: false }
  const medium = recent.filter((f) => f.severity === 'MEDIUM' || f.severity === 'HIGH').length
  const low = recent.filter((f) => f.severity === 'LOW').length
  return { show: true, total: recent.length, medium, low, level: medium > 0 ? 'red' : 'amber' }
}

function AnomalyBanner({ banner, onDismiss, onViewAll }: { banner: BannerState; onDismiss: () => void; onViewAll: () => void }): React.ReactElement {
  const bg = banner.level === 'red' ? '#fde8e8' : '#fef3e2'
  const border = banner.level === 'red' ? COLORS.critical : COLORS.warning
  const textColor = banner.level === 'red' ? '#7f1d1d' : '#6b3a00'
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <span style={{ color: textColor, fontWeight: 700, fontSize: '0.9rem' }}>
        ⚠ {banner.total} anomal{banner.total === 1 ? 'y' : 'ies'} in the last 24 hours — {banner.medium} MEDIUM, {banner.low} LOW
      </span>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" style={styles.bannerBtn} onClick={onViewAll}>View all ↓</button>
        <button type="button" style={{ ...styles.bannerBtn, background: 'transparent', border: 'none', fontSize: '1rem' }} onClick={onDismiss} title="Dismiss">✕</button>
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Occupancy Gauge
// ─────────────────────────────────────────────────────────────

function OccupancyGauge({ vehicles, prediction }: { vehicles: number; prediction: PredictionResult | null | undefined }): React.ReactElement {
  const pct = Math.min(100, Math.max(0, (vehicles / PARKING_CAPACITY) * 100))
  const color = occColor(pct)
  return (
    <article style={{ ...styles.chartCard, padding: '16px 20px' }}>
      <h3 style={styles.chartTitle}>Live Occupancy</h3>
      <div style={{ position: 'relative', height: 28, background: '#e9ddd0', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: color, borderRadius: 8, transition: 'width 0.6s ease' }} />
        {/* 50% marker */}
        <div style={{ position: 'absolute', left: '50%', top: 0, width: 2, height: '100%', background: 'rgba(0,0,0,0.25)' }} title="50% threshold" />
        {/* 80% marker */}
        <div style={{ position: 'absolute', left: '80%', top: 0, width: 2, height: '100%', background: 'rgba(0,0,0,0.35)' }} title="80% threshold" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color }}>
          {pct.toFixed(2)}% — {vehicles} / {PARKING_CAPACITY} vehicles
        </p>
        {prediction?.model_available && (
          <p style={{ margin: 0, fontSize: '0.88rem', color: prediction.direction === 'UP' ? COLORS.critical : prediction.direction === 'DOWN' ? COLORS.primary : '#666' }}>
            {prediction.direction === 'UP' ? '↑' : prediction.direction === 'DOWN' ? '↓' : '→'}{' '}
            {Math.abs(prediction.delta ?? 0).toFixed(2)}% predicted in 30 min
          </p>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: '0.77rem', color: '#5c4633' }}>
        <span style={{ color: COLORS.primary }}>■ 0–50% Normal</span>
        <span style={{ color: COLORS.warning }}>■ 50–80% Caution</span>
        <span style={{ color: COLORS.critical }}>■ 80–100% Critical</span>
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────
// Time series chart (kept from original, colors updated)
// ─────────────────────────────────────────────────────────────

function TimeSeriesChart({
  points,
  series,
  selectedTimestamp,
  onSelectTimestamp,
  baselineZero = false,
  showNetFlowToggle = false,
  showNetFlow = true,
  onToggleNetFlow,
}: {
  points: TrendPoint[]
  series: Array<{ key: keyof TrendPoint; label: string; color: string; dashed?: boolean }>
  selectedTimestamp: string | null
  onSelectTimestamp: (ts: string) => void
  baselineZero?: boolean
  showNetFlowToggle?: boolean
  showNetFlow?: boolean
  onToggleNetFlow?: () => void
}): React.ReactElement {
  const clipped = points.slice(-72)
  if (clipped.length === 0) return <EmptyChartState label="No data in selected range" />

  const visibleSeries = showNetFlowToggle
    ? series.filter((s) => s.key !== 'net_flow' || showNetFlow)
    : series

  const width = 760
  const height = 260
  const padding = 34

  const numericValues = clipped.flatMap((p) =>
    visibleSeries.map((s) => {
      const v = p[s.key]
      return typeof v === 'number' ? v : null
    }).filter((v): v is number => v !== null),
  )

  if (numericValues.length === 0) return <EmptyChartState label="No numeric values for this chart" />

  const minY = Math.min(...numericValues, baselineZero ? 0 : Infinity)
  const maxY = Math.max(...numericValues, baselineZero ? 0 : -Infinity)
  const yRange = Math.max(maxY - minY, 1)

  const getX = (i: number) =>
    clipped.length === 1
      ? padding + (width - padding * 2) / 2
      : padding + (i / (clipped.length - 1)) * (width - padding * 2)

  const getY = (v: number) =>
    height - padding - ((v - minY) / yRange) * (height - padding * 2)

  return (
    <div style={styles.chartWrap}>
      {showNetFlowToggle && (
        <button type="button" style={{ ...styles.resetButton, marginBottom: 6, fontSize: '0.78rem', padding: '4px 10px' }} onClick={onToggleNetFlow}>
          {showNetFlow ? 'Hide Net Flow' : 'Show Net Flow'}
        </button>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} style={styles.svgChart}>
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#8b6b4c" strokeWidth="1" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#8b6b4c" strokeWidth="1" />
        {baselineZero && (
          <line x1={padding} y1={getY(0)} x2={width - padding} y2={getY(0)} stroke="#9ea6a8" strokeDasharray="4 3" strokeWidth="1" />
        )}
        {visibleSeries.map((s) => {
          const path = clipped
            .map((p, i) => {
              const v = p[s.key]
              if (typeof v !== 'number') return null
              return `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(v)}`
            })
            .filter(Boolean)
            .join(' ')
          return (
            <path key={String(s.key)} d={path} fill="none" stroke={s.color} strokeWidth="2.4"
              strokeDasharray={s.dashed ? '6 4' : undefined} />
          )
        })}
        {clipped.map((p, i) => {
          const v = p[visibleSeries[0].key]
          if (typeof v !== 'number') return null
          const isOutlier = Math.abs(p.net_flow) > 4
          return (
            <circle key={`${p.timestamp}-m`} cx={getX(i)} cy={getY(v)}
              r={selectedTimestamp === p.timestamp ? 5.2 : 3.5}
              fill={isOutlier && baselineZero ? COLORS.critical : selectedTimestamp === p.timestamp ? '#0c2d26' : '#184b3f'}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectTimestamp(p.timestamp)}>
              <title>{p.timestamp}</title>
            </circle>
          )
        })}
      </svg>
      <div style={styles.legendRow}>
        {visibleSeries.map((s) => (
          <span key={String(s.key)} style={styles.legendItem}>
            <i style={{ ...styles.legendDot, background: s.color }} />{s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Scatter chart (kept from original)
// ─────────────────────────────────────────────────────────────

function ScatterChart<T extends { id: number; timestamp?: string | null }>({
  points, xKey, yKey, xLabel, yLabel, selectedId, onSelect, palette,
}: {
  points: T[]
  xKey: string; yKey: string; xLabel: string; yLabel: string
  selectedId: number | null
  onSelect: (id: number, timestamp: string | null) => void
  palette?: (point: T) => string
}): React.ReactElement {
  const valid = points
    .map((p) => {
      const pr = p as Record<string, unknown>
      const x = pr[xKey]; const y = pr[yKey]
      if (typeof x !== 'number' || typeof y !== 'number') return null
      return { id: p.id, x, y, timestamp: typeof p.timestamp === 'string' ? p.timestamp : null, point: p }
    })
    .filter((p): p is { id: number; x: number; y: number; timestamp: string | null; point: T } => p !== null)
    .slice(0, 1400)

  if (valid.length === 0) return <EmptyChartState label="No scatter points" />

  const width = 760; const height = 260; const padding = 36
  const minX = Math.min(...valid.map((p) => p.x))
  const maxX = Math.max(...valid.map((p) => p.x))
  const minY = Math.min(...valid.map((p) => p.y))
  const maxY = Math.max(...valid.map((p) => p.y))
  const xRange = Math.max(maxX - minX, 1)
  const yRange = Math.max(maxY - minY, 1)
  const getX = (v: number) => padding + ((v - minX) / xRange) * (width - padding * 2)
  const getY = (v: number) => height - padding - ((v - minY) / yRange) * (height - padding * 2)

  return (
    <div style={styles.chartWrap}>
      <svg viewBox={`0 0 ${width} ${height}`} style={styles.svgChart}>
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#8b6b4c" strokeWidth="1" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#8b6b4c" strokeWidth="1" />
        {valid.map((p) => (
          <circle key={p.id} cx={getX(p.x)} cy={getY(p.y)}
            r={selectedId === p.id ? 4.8 : 3.1}
            fill={palette ? palette(p.point) : '#146356'}
            opacity={selectedId === p.id ? 1 : 0.78}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect(p.id, p.timestamp)}>
            <title>{`${xLabel}: ${p.x.toFixed(2)} | ${yLabel}: ${p.y.toFixed(2)}`}</title>
          </circle>
        ))}
      </svg>
      <div style={styles.legendRow}>
        <span style={styles.legendItem}>X: {xLabel}</span>
        <span style={styles.legendItem}>Y: {yLabel}</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Daily Summary Strip
// ─────────────────────────────────────────────────────────────

function Sparkline({ values }: { values: (number | null)[] }): React.ReactElement {
  const valid = values.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v !== null)
  if (valid.length < 2) return <div style={{ height: 32 }} />

  const w = 100; const h = 32; const pad = 2
  const minV = Math.min(...valid.map((p) => p.v))
  const maxV = Math.max(...valid.map((p) => p.v))
  const vRange = Math.max(maxV - minV, 1)
  const getX = (i: number) => pad + (i / (values.length - 1)) * (w - pad * 2)
  const getY = (v: number) => h - pad - ((v - minV) / vRange) * (h - pad * 2)

  const path = valid.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(p.i)} ${getY(p.v)}`).join(' ')
  const color = occColor(valid[valid.length - 1]?.v ?? 0)

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 32, display: 'block' }}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.8" />
    </svg>
  )
}

function DailySummaryStrip({ summaries }: { summaries: DailySummary[] }): React.ReactElement {
  if (summaries.length === 0) return <EmptyChartState label="No daily summary data" />

  return (
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
      {summaries.map((s) => {
        const label = new Date(s.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        const avgColor = s.avg_pct !== null ? occColor(s.avg_pct) : '#888'
        return (
          <article key={s.date} style={{ minWidth: 120, background: '#fffdf8', border: '1px solid rgba(111,78,55,0.2)', borderRadius: 12, padding: '10px 12px', flexShrink: 0 }}>
            <p style={{ margin: '0 0 4px 0', fontSize: '0.75rem', fontWeight: 700, color: '#5c4633' }}>{label}</p>
            <Sparkline values={s.sparkline} />
            <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', fontWeight: 700, color: avgColor }}>
              avg {s.avg_pct !== null ? `${s.avg_pct.toFixed(1)}%` : '—'}
            </p>
            <p style={{ margin: 0, fontSize: '0.74rem', color: '#7a5c3e' }}>
              peak {s.max_pct !== null ? `${s.max_pct.toFixed(1)}%` : '—'}
            </p>
            <p style={{ margin: 0, fontSize: '0.74rem', color: '#7a5c3e' }}>
              ↑{s.total_in} ↓{s.total_out}
            </p>
          </article>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Anomaly Flags Table (improved)
// ─────────────────────────────────────────────────────────────

function AnomalyTable({
  rows,
  onSelect,
}: {
  rows: AnomalyFlag[]
  onSelect: (id: number, timestamp: string) => void
}): React.ReactElement {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL')
  const [dirFilter, setDirFilter] = useState<DirectionFilter>('ALL')
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('24h')

  const filtered = useMemo(() => {
    const cutoffMap: Record<TimeRangeFilter, number> = {
      '24h': Date.now() - 86400000,
      '7d': Date.now() - 7 * 86400000,
      'all': 0,
    }
    const cutoff = cutoffMap[timeRange]
    return rows.filter((r) => {
      if (new Date(r.timestamp).getTime() < cutoff) return false
      if (severityFilter !== 'ALL' && r.severity !== severityFilter) return false
      const dir = r.direction || r.direction_view
      if (dirFilter !== 'ALL' && dir !== dirFilter) return false
      return true
    })
  }, [rows, severityFilter, dirFilter, timeRange])

  const medium = filtered.filter((r) => r.severity === 'MEDIUM' || r.severity === 'HIGH').length
  const low = filtered.filter((r) => r.severity === 'LOW').length

  const severityBg = (s: string) =>
    s === 'HIGH' || s === 'MEDIUM' ? COLORS.critical : COLORS.warning

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: '#163a31' }}>
          {filtered.length} flags — {medium} MEDIUM, {low} LOW
        </p>
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)} style={styles.input}>
          <option value="ALL">All severities</option>
          <option value="MEDIUM">MEDIUM only</option>
          <option value="LOW">LOW only</option>
        </select>
        <select value={dirFilter} onChange={(e) => setDirFilter(e.target.value as DirectionFilter)} style={styles.input}>
          <option value="ALL">All directions</option>
          <option value="IN">IN</option>
          <option value="OUT">OUT</option>
          <option value="FLAT">FLAT</option>
        </select>
        <select value={timeRange} onChange={(e) => setTimeRange(e.target.value as TimeRangeFilter)} style={styles.input}>
          <option value="24h">Last 24h</option>
          <option value="7d">Last 7 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyChartState label="No anomaly flags for this filter" />
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Severity</th>
                <th style={styles.th}>Timestamp</th>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Reason(s)</th>
                <th style={styles.th}>Direction</th>
                <th style={styles.th}>Vehicles</th>
                <th style={styles.th}>Parking %</th>
                <th style={styles.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 150).map((row) => (
                <tr key={`${row.id}-${row.timestamp}`}>
                  <td style={styles.td}>
                    <span style={{ background: severityBg(row.severity), color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>
                      {row.severity}
                    </span>
                  </td>
                  <td style={styles.td}>{formatTimestamp(row.timestamp)}</td>
                  <td style={styles.td}>{row.id}</td>
                  <td style={styles.td}>
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {row.reasons.map((r) => (
                        <span key={r} title={REASON_LABELS[r] || r}
                          style={{ background: '#f0e8d8', border: '1px solid #d3b48e', borderRadius: 20, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 700, cursor: 'help', whiteSpace: 'nowrap' }}>
                          {r}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td style={styles.td}>{row.direction || row.direction_view}</td>
                  <td style={styles.td}>{row.current_vehicles}</td>
                  <td style={{ ...styles.td, color: row.parking_percentage !== null ? occColor(row.parking_percentage) : undefined, fontWeight: 700 }}>
                    {formatNumber(row.parking_percentage ?? null)}%
                  </td>
                  <td style={styles.td}>
                    <button type="button" style={styles.applyButton} onClick={() => onSelect(row.id, row.timestamp)}>
                      Drilldown
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Correlation heatmap (kept from original)
// ─────────────────────────────────────────────────────────────

function CorrelationHeatmap({ matrix }: { matrix: CorrelationMatrix | null }): React.ReactElement {
  if (!matrix || matrix.metrics.length === 0) return <EmptyChartState label="No correlation matrix" />

  const valueMap = new Map<string, number | null>()
  for (const pair of matrix.pairs) valueMap.set(`${pair.x}::${pair.y}`, pair.value)

  const colorFor = (v: number | null) => {
    if (v === null) return '#f3e7d7'
    if (v >= 0.7) return '#0f766e'
    if (v >= 0.3) return '#34a0a4'
    if (v > -0.3) return '#f59e0b'
    if (v > -0.7) return '#fb7185'
    return '#be123c'
  }

  return (
    <div style={styles.heatmapWrap}>
      <table style={styles.heatmapTable}>
        <thead>
          <tr>
            <th style={styles.heatmapHeaderCell}>metric</th>
            {matrix.metrics.map((m) => <th key={m} style={styles.heatmapHeaderCell}>{m}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.metrics.map((rowM) => (
            <tr key={rowM}>
              <th style={styles.heatmapHeaderCell}>{rowM}</th>
              {matrix.metrics.map((colM) => {
                const v = valueMap.get(`${rowM}::${colM}`) ?? null
                return (
                  <td key={`${rowM}-${colM}`} style={{ ...styles.heatmapCell, background: colorFor(v) }}
                    title={`${rowM} vs ${colM} = ${v === null ? 'n/a' : v.toFixed(3)}`}>
                    {v === null ? 'n/a' : v.toFixed(2)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Hourly Heatmap (Day × Hour)
// ─────────────────────────────────────────────────────────────

function HourlyHeatmap({ heatmap }: { heatmap: HeatmapData | null }): React.ReactElement {
  if (!heatmap) return <EmptyChartState label="Loading heatmap…" />

  const cellMap = new Map<string, { avg_pct: number | null; count: number }>()
  for (const c of heatmap.cells) cellMap.set(`${c.day}::${c.hour}`, { avg_pct: c.avg_pct, count: c.count })

  const heatColor = (pct: number | null) => {
    if (pct === null) return '#f3ede3'
    if (pct >= 80) return COLORS.critical
    if (pct >= 50) return COLORS.warning
    if (pct >= 20) return COLORS.primary
    return '#a8d5c2'
  }

  const textColor = (pct: number | null) => {
    if (pct === null) return '#aaa'
    return pct >= 30 ? '#fff' : '#333'
  }

  return (
    <div style={styles.heatmapWrap}>
      <table style={{ ...styles.heatmapTable, minWidth: '900px' }}>
        <thead>
          <tr>
            <th style={{ ...styles.heatmapHeaderCell, minWidth: 80 }}>Day \ Hour</th>
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} style={{ ...styles.heatmapHeaderCell, textAlign: 'center', minWidth: 34, padding: '4px 2px' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heatmap.days.map((day) => (
            <tr key={day}>
              <th style={{ ...styles.heatmapHeaderCell, fontWeight: 700 }}>{day.slice(0, 3)}</th>
              {Array.from({ length: 24 }, (_, h) => {
                const cell = cellMap.get(`${day}::${h}`)
                const pct = cell?.avg_pct ?? null
                return (
                  <td key={h}
                    style={{ background: heatColor(pct), color: textColor(pct), border: '1px solid rgba(0,0,0,0.08)', padding: '3px 2px', textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, minWidth: 34 }}
                    title={pct !== null ? `${day} ${h}:00 — avg ${pct}% (n=${cell?.count})` : `${day} ${h}:00 — no data`}>
                    {pct !== null ? pct.toFixed(0) : ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Day-of-Week Bar Chart
// ─────────────────────────────────────────────────────────────

function DayOfWeekBar({ data }: { data: { days: DayOfWeekStat[]; overall_avg: number | null } | null }): React.ReactElement {
  if (!data) return <EmptyChartState label="Loading…" />
  const { days, overall_avg } = data
  const validDays = days.filter((d) => d.avg_pct !== null)
  if (validDays.length === 0) return <EmptyChartState label="No day-of-week data" />

  const maxPct = Math.max(...validDays.map((d) => d.avg_pct!))
  const width = 560
  const height = 200
  const padL = 30
  const padB = 28
  const padT = 12
  const barW = Math.floor((width - padL) / days.length) - 4

  return (
    <div style={styles.chartWrap}>
      <svg viewBox={`0 0 ${width} ${height}`} style={styles.svgChart}>
        <line x1={padL} y1={padT} x2={padL} y2={height - padB} stroke="#8b6b4c" strokeWidth="1" />
        <line x1={padL} y1={height - padB} x2={width} y2={height - padB} stroke="#8b6b4c" strokeWidth="1" />
        {/* Overall avg reference line */}
        {overall_avg !== null && (
          <line
            x1={padL}
            y1={height - padB - (overall_avg / Math.max(maxPct, 1)) * (height - padT - padB)}
            x2={width}
            y2={height - padB - (overall_avg / Math.max(maxPct, 1)) * (height - padT - padB)}
            stroke="#7a5c3e" strokeDasharray="4 3" strokeWidth="1.2"
          />
        )}
        {days.map((d, i) => {
          const pct = d.avg_pct ?? 0
          const barH = (pct / Math.max(maxPct, 1)) * (height - padT - padB)
          const x = padL + 2 + i * ((width - padL) / days.length)
          const y = height - padB - barH
          const color = occColor(pct)
          return (
            <g key={d.day}>
              <rect x={x} y={y} width={barW} height={barH} fill={color} rx={3} opacity={0.85} />
              <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize="9" fill={color} fontWeight="700">
                {pct > 0 ? pct.toFixed(1) : ''}
              </text>
              <text x={x + barW / 2} y={height - padB + 12} textAnchor="middle" fontSize="9" fill="#5c4633">
                {d.day.slice(0, 3)}
              </text>
            </g>
          )
        })}
        {overall_avg !== null && (
          <text x={width - 4} y={height - padB - (overall_avg / Math.max(maxPct, 1)) * (height - padT - padB) - 4}
            textAnchor="end" fontSize="9" fill="#7a5c3e" fontWeight="700">
            avg {overall_avg.toFixed(1)}%
          </text>
        )}
      </svg>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Temperature vs Occupancy bucket chart
// ─────────────────────────────────────────────────────────────

function TempBucketChart({ buckets }: { buckets: TempBucket[] }): React.ReactElement {
  if (buckets.length === 0) return <EmptyChartState label="No temperature bucket data" />

  const maxPct = Math.max(...buckets.map((b) => b.avg_pct + b.std))
  const width = 560
  const height = 200
  const padL = 30
  const padB = 36
  const padT = 12
  const barW = Math.max(8, Math.floor((width - padL) / buckets.length) - 4)

  const getY = (v: number) => height - padB - (v / Math.max(maxPct, 1)) * (height - padT - padB)

  return (
    <div style={styles.chartWrap}>
      <svg viewBox={`0 0 ${width} ${height}`} style={styles.svgChart}>
        <line x1={padL} y1={padT} x2={padL} y2={height - padB} stroke="#8b6b4c" strokeWidth="1" />
        <line x1={padL} y1={height - padB} x2={width} y2={height - padB} stroke="#8b6b4c" strokeWidth="1" />
        {buckets.map((b, i) => {
          const x = padL + 2 + i * ((width - padL) / buckets.length)
          const barH = (b.avg_pct / Math.max(maxPct, 1)) * (height - padT - padB)
          const y = getY(b.avg_pct)
          const color = occColor(b.avg_pct)
          const errTop = getY(Math.min(b.avg_pct + b.std, 100))
          const errBot = getY(Math.max(b.avg_pct - b.std, 0))
          return (
            <g key={b.temp_range}>
              <rect x={x} y={y} width={barW} height={barH} fill={color} rx={3} opacity={0.8} />
              {/* Error bars */}
              <line x1={x + barW / 2} y1={errTop} x2={x + barW / 2} y2={errBot} stroke="#333" strokeWidth="1.2" />
              <line x1={x + barW / 2 - 3} y1={errTop} x2={x + barW / 2 + 3} y2={errTop} stroke="#333" strokeWidth="1.2" />
              <line x1={x + barW / 2 - 3} y1={errBot} x2={x + barW / 2 + 3} y2={errBot} stroke="#333" strokeWidth="1.2" />
              {/* Label */}
              <text x={x + barW / 2} y={height - padB + 12} textAnchor="middle" fontSize="8" fill="#5c4633">
                {b.temp_range.split('–')[0]}
              </text>
              <text x={x + barW / 2} y={height - padB + 22} textAnchor="middle" fontSize="7" fill="#7a5c3e">
                n={b.count}
              </text>
            </g>
          )
        })}
      </svg>
      <div style={styles.legendRow}>
        <span style={styles.legendItem}>X: Temperature bucket (°C) — Y: Avg parking % — Error bars ±1 std</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sensor Health Scorecard
// ─────────────────────────────────────────────────────────────

function SensorHealthScorecard({ health }: { health: SensorHealthData | null }): React.ReactElement {
  if (!health) return <EmptyChartState label="Loading sensor health…" />

  const statusColor = (s: string) => s === 'OK' ? COLORS.primary : s === 'WARN' ? COLORS.warning : COLORS.critical

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
      {Object.entries(health).map(([name, entry]) => (
        <article key={name} style={{ background: '#fffdf8', border: `2px solid ${statusColor(entry.status)}`, borderRadius: 12, padding: '12px 14px' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.82rem', color: '#163a31' }}>{name}</p>
          <p style={{ margin: '6px 0 0 0', fontSize: '1.1rem', fontWeight: 700, color: statusColor(entry.status) }}>
            {entry.active_rate.toFixed(1)}% active
          </p>
          <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#5c4633' }}>
            avg {entry.avg_when_active !== null ? `${entry.avg_when_active.toFixed(2)} cm` : '—'}
          </p>
          <span style={{ display: 'inline-block', marginTop: 6, background: statusColor(entry.status), color: '#fff', borderRadius: 6, padding: '1px 8px', fontSize: '0.73rem', fontWeight: 700 }}>
            {entry.status}
          </span>
        </article>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sensor Baseline Config (editable)
// ─────────────────────────────────────────────────────────────

function SensorBaselineConfig({
  thresholds,
  onSave,
}: {
  thresholds: AnomalyThresholds
  onSave: (t: AnomalyThresholds) => void
}): React.ReactElement {
  const [draft, setDraft] = useState(thresholds)

  return (
    <article style={styles.panel}>
      <h3 style={styles.panelTitle}>Sensor Baseline Thresholds (editable)</h3>
      <p style={{ margin: '0 0 10px 0', fontSize: '0.82rem', color: '#5c4633' }}>
        Override the computed p95 thresholds used for anomaly detection. Saving will recompute anomaly flags.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        {([
          ['sensorGapIn', 'Sensor Gap In p95 (s)', draft.sensorGapIn],
          ['sensorGapOut', 'Sensor Gap Out p95 (s)', draft.sensorGapOut],
          ['occupancyChange', 'Occupancy Change p95 (vehicles)', draft.occupancyChange],
        ] as Array<[keyof AnomalyThresholds, string, string]>).map(([key, label, val]) => (
          <label key={key} style={styles.label}>
            {label}
            <input
              type="number"
              step="0.01"
              value={val}
              onChange={(e) => setDraft((p) => ({ ...p, [key]: e.target.value }))}
              style={styles.input}
            />
          </label>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <button type="button" style={styles.applyButton} onClick={() => onSave(draft)}>
          Save &amp; Recompute Anomalies
        </button>
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────
// Full logs table (kept from original)
// ─────────────────────────────────────────────────────────────

function DataTable({ rows }: { rows: ParkingLogRow[] }): React.ReactElement {
  if (rows.length === 0) return <EmptyChartState label="No rows for selected filters and drilldown" />
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>{TABLE_COLUMNS.map((c) => <th key={c.key} style={styles.th}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {TABLE_COLUMNS.map((c) => (
                <td key={`${row.id}-${c.key}`} style={styles.td}>{formatCellValue(c, row[c.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export default function Home(): React.ReactElement {
  // Tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>('live')

  // Filters (for diagnostics table)
  const [draftFilters, setDraftFilters] = useState<Filters>(INITIAL_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<Filters>(INITIAL_FILTERS)

  // Custom anomaly thresholds
  const [appliedThresholds, setAppliedThresholds] = useState<AnomalyThresholds>(INITIAL_THRESHOLDS)

  // Auto-refresh state (Tab 1 only)
  const [refreshKey, setRefreshKey] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Anomaly banner
  const [bannerDismissed, setBannerDismissed] = useState(false)

  // Drilldown + table pagination
  const [drilldown, setDrilldown] = useState<DrilldownState>({ bucketTimestamp: null, directionView: null, isRaining: null, rowId: null })
  const [tablePage, setTablePage] = useState(0)
  const [reportLoading, setReportLoading] = useState<'daily' | 'weekly' | null>(null)

  // In/Out chart toggle
  const [showNetFlow, setShowNetFlow] = useState(true)

  // Refs for scrolling
  const anomalyTableRef = useRef<HTMLDivElement>(null)
  const diagnosticsRef = useRef<HTMLElement>(null)

  // Data
  const { data, loading, error } = useDashboardData(appliedFilters, appliedThresholds, refreshKey)
  const { analyticsData, analyticsLoading } = useAnalyticsData()
  const { sensorHealth, sensorLoading } = useSensorHealth()

  // Auto-refresh Tab 1 every 60s
  useEffect(() => {
    if (activeTab !== 'live') return
    const id = setInterval(() => {
      setRefreshKey((k) => k + 1)
      setLastUpdated(new Date())
    }, 60000)
    return () => clearInterval(id)
  }, [activeTab])

  const trendPoints = data?.trends || []

  // Anomaly banner
  const banner = useMemo(() => computeBannerState(data?.anomaly_flags || []), [data?.anomaly_flags])

  // Drilldown helper
  const openDiagnosticsWithDrilldown = (patch: Partial<DrilldownState>): void => {
    setDrilldown((prev) => ({ ...prev, ...patch }))
    setTablePage(0)
    setActiveTab('diagnostics')
    setTimeout(() => diagnosticsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  const scrollToAnomalyTable = () => {
    setActiveTab('live')
    setTimeout(() => anomalyTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  // Table rows with drilldown
  const tableRows = useMemo(() => {
    if (!data) return []
    return data.logs.filter((row) => {
      if (drilldown.rowId !== null && row.id !== drilldown.rowId) return false
      if (drilldown.bucketTimestamp && bucketTimestampString(row.timestamp, appliedFilters.bucket) !== drilldown.bucketTimestamp) return false
      if (drilldown.directionView && row.direction_view !== drilldown.directionView) return false
      if (drilldown.isRaining !== null && row.is_raining !== drilldown.isRaining) return false
      return true
    })
  }, [data, drilldown, appliedFilters.bucket])

  const totalTablePages = Math.max(1, Math.ceil(tableRows.length / FULL_TABLE_PAGE_SIZE))
  const currentPage = Math.min(tablePage, totalTablePages - 1)
  const startIdx = currentPage * FULL_TABLE_PAGE_SIZE
  const pageRows = tableRows.slice(startIdx, startIdx + FULL_TABLE_PAGE_SIZE)

  const drilldownChips = useMemo(() => {
    const chips: string[] = []
    if (drilldown.bucketTimestamp) chips.push(`Time: ${drilldown.bucketTimestamp}`)
    if (drilldown.directionView) chips.push(`Direction: ${drilldown.directionView}`)
    if (drilldown.isRaining !== null) chips.push(`Rain: ${drilldown.isRaining ? 'rainy' : 'dry'}`)
    if (drilldown.rowId !== null) chips.push(`ID: ${drilldown.rowId}`)
    return chips
  }, [drilldown])

  const boardTempVsUltrasonicIn = useMemo(() =>
    (data?.board_temp_sensor_scatter || []).map((p) => ({ id: p.id, timestamp: p.timestamp, board_temperature: p.board_temperature, sensor_value: p.ultrasonic_in_cm })),
    [data],
  )
  const boardTempVsLidarOut = useMemo(() =>
    (data?.board_temp_sensor_scatter || []).map((p) => ({ id: p.id, timestamp: p.timestamp, board_temperature: p.board_temperature, sensor_value: p.lidar_out_cm })),
    [data],
  )

  const exportPresetReport = async (preset: 'daily' | 'weekly'): Promise<void> => {
    try {
      setReportLoading(preset)
      const response = await fetch(buildReportUrl(appliedFilters, preset))
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.detail || `Unable to export ${preset} report`)
      exportObjectRowsAsCsv(Array.isArray(payload?.rows) ? payload.rows : [], `parking_logs_${preset}_report_${new Date().toISOString()}.csv`)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : `Unable to export ${preset} report`)
    } finally {
      setReportLoading(null)
    }
  }

  const prediction = analyticsData?.prediction ?? null

  // ── Render ──
  return (
    <main style={styles.page}>
      <div style={styles.heroBlob} />
      <section style={styles.container}>
        {/* Header */}
        <header style={styles.header}>
          <p style={styles.eyebrow}>Parking Logs Dashboard</p>
          <h1 style={styles.title}>Occupancy, Weather &amp; Sensor Diagnostics</h1>
        </header>

        {/* Tab buttons */}
        <section style={styles.tabRow}>
          {(['live', 'analytics', 'diagnostics'] as ActiveTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              style={{ ...styles.tabButton, ...(activeTab === tab ? styles.tabButtonActive : {}) }}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'live' ? 'Live Monitor' : tab === 'analytics' ? 'Analytics' : 'Diagnostics + Data'}
            </button>
          ))}
        </section>

        {/* Anomaly Banner (global) */}
        {!bannerDismissed && banner.show && (
          <AnomalyBanner banner={banner} onDismiss={() => setBannerDismissed(true)} onViewAll={scrollToAnomalyTable} />
        )}

        {error && <div style={styles.errorBox}>Error: {error}</div>}

        {/* ── TAB 1: LIVE MONITOR ─────────────────────────────── */}
        {activeTab === 'live' && (
          <>
            {/* Auto-refresh indicator */}
            <div style={{ marginBottom: 8, fontSize: '0.78rem', color: '#7a5c3e', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Auto-refresh every 60s</span>
              {lastUpdated && <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>}
            </div>

            {/* KPI Bar */}
            <section style={styles.kpiGrid}>
              <KpiCard title="Total Logs" value={String(data?.kpis.total_logs ?? 0)} />
              <KpiCard title="Current Vehicles" value={`${data?.kpis.current_vehicles_latest ?? 0} / ${PARKING_CAPACITY}`} />
              <KpiCard title="Avg Parking %" value={`${formatNumber(data?.kpis.avg_parking_percentage ?? null)}%`} />
              <KpiCard title="Total IN / OUT" value={`${data?.kpis.total_in ?? 0} / ${data?.kpis.total_out ?? 0}`} />
              <KpiCard
                title="Latest Net Flow"
                value={String(data?.kpis.latest_net_flow ?? 0)}
                color={(data?.kpis.latest_net_flow ?? 0) < 0 ? COLORS.critical : (data?.kpis.latest_net_flow ?? 0) > 0 ? COLORS.primary : undefined}
              />
              <KpiCard title="Rain Ratio" value={`${((data?.kpis.rain_ratio ?? 0) * 100).toFixed(1)}%`} />
              <KpiCard title="Avg Board Temp" value={`${formatNumber(data?.kpis.avg_board_temperature ?? null)} °C`} />
              <MlPredictionCard pred={prediction} />
            </section>

            {/* Occupancy Gauge */}
            <section style={{ marginBottom: 10 }}>
              <OccupancyGauge vehicles={data?.kpis.current_vehicles_latest ?? 0} prediction={prediction} />
            </section>

            {/* Occupancy + Prediction Trend */}
            <section style={styles.chartGrid}>
              <article style={styles.chartCardWide}>
                <h3 style={styles.chartTitle}>Occupancy &amp; Prediction Trend</h3>
                {loading ? <EmptyChartState label="Loading…" /> : (
                  <TimeSeriesChart
                    points={trendPoints}
                    series={[
                      { key: 'parking_percentage', label: 'Parking %', color: COLORS.primary },
                    ]}
                    selectedTimestamp={drilldown.bucketTimestamp}
                    onSelectTimestamp={(ts) => openDiagnosticsWithDrilldown({ bucketTimestamp: ts, rowId: null })}
                  />
                )}
              </article>

              {/* In / Out / Net Flow */}
              <article style={styles.chartCardWide}>
                <h3 style={styles.chartTitle}>In / Out and Net Flow</h3>
                {loading ? <EmptyChartState label="Loading…" /> : (
                  <TimeSeriesChart
                    points={trendPoints}
                    series={[
                      { key: 'in_count', label: 'IN', color: COLORS.inFlow },
                      { key: 'out_count', label: 'OUT', color: COLORS.outFlow },
                      { key: 'net_flow', label: 'Net Flow', color: COLORS.netFlow },
                    ]}
                    selectedTimestamp={drilldown.bucketTimestamp}
                    onSelectTimestamp={(ts) => openDiagnosticsWithDrilldown({ bucketTimestamp: ts, rowId: null })}
                    baselineZero
                    showNetFlowToggle
                    showNetFlow={showNetFlow}
                    onToggleNetFlow={() => setShowNetFlow((v) => !v)}
                  />
                )}
              </article>
            </section>

            {/* Daily Summary Strip */}
            <section style={{ ...styles.panel, marginBottom: 10 }}>
              <h3 style={styles.panelTitle}>Daily Summary — Last 7 Days</h3>
              {analyticsLoading ? <EmptyChartState label="Loading…" /> : (
                <DailySummaryStrip summaries={analyticsData?.daily_summary || []} />
              )}
            </section>

            {/* Anomaly Flags Table */}
            <section style={styles.panel} ref={anomalyTableRef}>
              <h3 style={styles.panelTitle}>Anomaly Flags</h3>
              {loading ? <EmptyChartState label="Loading…" /> : (
                <AnomalyTable
                  rows={data?.anomaly_flags || []}
                  onSelect={(id, ts) => openDiagnosticsWithDrilldown({ rowId: id, bucketTimestamp: bucketTimestampString(ts, appliedFilters.bucket), directionView: null, isRaining: null })}
                />
              )}
            </section>
          </>
        )}

        {/* ── TAB 2: ANALYTICS ─────────────────────────────────── */}
        {activeTab === 'analytics' && (
          <>
            <section style={styles.chartGrid}>
              {/* Hourly Heatmap */}
              <article style={styles.chartCardWide}>
                <h3 style={styles.chartTitle}>Hourly Occupancy Heatmap (Day × Hour)</h3>
                <p style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: '#5c4633' }}>
                  Avg parking % per hour of day. Thu 12–15h should be darkest.
                </p>
                {analyticsLoading ? <EmptyChartState label="Loading…" /> : <HourlyHeatmap heatmap={analyticsData?.heatmap ?? null} />}
              </article>

              {/* Day-of-Week Bar */}
              <article style={styles.chartCard}>
                <h3 style={styles.chartTitle}>Day-of-Week Pattern</h3>
                {analyticsLoading ? <EmptyChartState label="Loading…" /> : (
                  <DayOfWeekBar data={analyticsData?.day_of_week ?? null} />
                )}
              </article>

              {/* Temperature vs Occupancy bucketed */}
              <article style={styles.chartCard}>
                <h3 style={styles.chartTitle}>Temperature vs Occupancy (2°C buckets)</h3>
                {analyticsLoading ? <EmptyChartState label="Loading…" /> : (
                  <TempBucketChart buckets={analyticsData?.temp_buckets ?? []} />
                )}
              </article>

              {/* Weather Trend */}
              <article style={styles.chartCardWide}>
                <h3 style={styles.chartTitle}>Weather Trend (Temperature &amp; Humidity)</h3>
                {loading ? <EmptyChartState label="Loading…" /> : (
                  <TimeSeriesChart
                    points={trendPoints}
                    series={[
                      { key: 'api_temperature', label: 'Temperature (°C)', color: '#c2410c' },
                      { key: 'api_humidity', label: 'Humidity (%)', color: COLORS.prediction },
                    ]}
                    selectedTimestamp={drilldown.bucketTimestamp}
                    onSelectTimestamp={(ts) => openDiagnosticsWithDrilldown({ bucketTimestamp: ts, rowId: null })}
                  />
                )}
              </article>

              {/* Correlation Matrix */}
              <article style={styles.chartCardWide}>
                <h3 style={styles.chartTitle}>Correlation Matrix</h3>
                {loading ? <EmptyChartState label="Loading…" /> : <CorrelationHeatmap matrix={data?.correlation_matrix ?? null} />}
              </article>

              {/* Prediction Accuracy Placeholder */}
              <article style={styles.chartCard}>
                <h3 style={styles.chartTitle}>Prediction Accuracy Tracker</h3>
                <EmptyChartState label="Will display once historical predictions are collected" />
                {/* TODO: add confidence intervals and accuracy tracker */}
              </article>
            </section>
          </>
        )}

        {/* ── TAB 3: DIAGNOSTICS + DATA ─────────────────────────── */}
        {activeTab === 'diagnostics' && (
          <section ref={diagnosticsRef}>
            {/* Sensor Health */}
            <section style={styles.panel}>
              <h3 style={styles.panelTitle}>Sensor Health Scorecard</h3>
              <p style={{ margin: '0 0 10px 0', fontSize: '0.8rem', color: '#5c4633' }}>
                Current data has ~65.9% zero rate — WARN/CRITICAL is expected for all sensors.
              </p>
              {sensorLoading ? <EmptyChartState label="Loading sensor health…" /> : <SensorHealthScorecard health={sensorHealth} />}
            </section>

            {/* Sensor Baseline Config */}
            <SensorBaselineConfig
              thresholds={appliedThresholds}
              onSave={(t) => {
                setAppliedThresholds(t)
                setRefreshKey((k) => k + 1)
              }}
            />

            {/* Sensor Debug Charts */}
            <section style={styles.panel}>
              <h3 style={styles.panelTitle}>Sensor Debug Charts</h3>
              <div style={styles.chartGrid}>
                <article style={styles.chartCard}>
                  <h3 style={styles.chartTitle}>Inbound Sensor Trend</h3>
                  {loading ? <EmptyChartState label="Loading…" /> : (
                    <TimeSeriesChart
                      points={trendPoints}
                      series={[
                        { key: 'ultrasonic_in_cm', label: 'Ultrasonic In (cm)', color: '#0891b2' },
                        { key: 'lidar_in_cm', label: 'Lidar In (cm)', color: '#16a34a' },
                        { key: 'pir_in_trigger', label: 'PIR In', color: COLORS.critical },
                      ]}
                      selectedTimestamp={drilldown.bucketTimestamp}
                      onSelectTimestamp={(ts) => setDrilldown((p) => ({ ...p, bucketTimestamp: ts }))}
                    />
                  )}
                </article>

                <article style={styles.chartCard}>
                  <h3 style={styles.chartTitle}>Outbound Sensor Trend</h3>
                  {loading ? <EmptyChartState label="Loading…" /> : (
                    <TimeSeriesChart
                      points={trendPoints}
                      series={[
                        { key: 'ultrasonic_out_cm', label: 'Ultrasonic Out (cm)', color: '#0284c7' },
                        { key: 'lidar_out_cm', label: 'Lidar Out (cm)', color: '#22c55e' },
                        { key: 'pir_out_trigger', label: 'PIR Out', color: '#be123c' },
                      ]}
                      selectedTimestamp={drilldown.bucketTimestamp}
                      onSelectTimestamp={(ts) => setDrilldown((p) => ({ ...p, bucketTimestamp: ts }))}
                    />
                  )}
                </article>

                <article style={styles.chartCard}>
                  <h3 style={styles.chartTitle}>Raw vs Converted: Ultrasonic In</h3>
                  {loading ? <EmptyChartState label="Loading…" /> : (
                    <ScatterChart points={data?.raw_vs_converted_checks.ultrasonic_in || []} xKey="raw" yKey="converted" xLabel="raw_ultrasonic_in_us" yLabel="ultrasonic_in_cm" selectedId={drilldown.rowId}
                      onSelect={(id, ts) => openDiagnosticsWithDrilldown({ rowId: id, bucketTimestamp: ts ? bucketTimestampString(ts, appliedFilters.bucket) : null, directionView: null, isRaining: null })} />
                  )}
                </article>

                <article style={styles.chartCard}>
                  <h3 style={styles.chartTitle}>Raw vs Converted: Ultrasonic Out</h3>
                  {loading ? <EmptyChartState label="Loading…" /> : (
                    <ScatterChart points={data?.raw_vs_converted_checks.ultrasonic_out || []} xKey="raw" yKey="converted" xLabel="raw_ultrasonic_out_us" yLabel="ultrasonic_out_cm" selectedId={drilldown.rowId}
                      onSelect={(id, ts) => openDiagnosticsWithDrilldown({ rowId: id, bucketTimestamp: ts ? bucketTimestampString(ts, appliedFilters.bucket) : null, directionView: null, isRaining: null })} />
                  )}
                </article>

                <article style={styles.chartCard}>
                  <h3 style={styles.chartTitle}>Raw vs Converted: Lidar In</h3>
                  {loading ? <EmptyChartState label="Loading…" /> : (
                    <ScatterChart points={data?.raw_vs_converted_checks.lidar_in || []} xKey="raw" yKey="converted" xLabel="raw_lidar_in_analog" yLabel="lidar_in_cm" selectedId={drilldown.rowId}
                      onSelect={(id, ts) => openDiagnosticsWithDrilldown({ rowId: id, bucketTimestamp: ts ? bucketTimestampString(ts, appliedFilters.bucket) : null, directionView: null, isRaining: null })} />
                  )}
                </article>

                <article style={styles.chartCard}>
                  <h3 style={styles.chartTitle}>Raw vs Converted: Lidar Out</h3>
                  {loading ? <EmptyChartState label="Loading…" /> : (
                    <ScatterChart points={data?.raw_vs_converted_checks.lidar_out || []} xKey="raw" yKey="converted" xLabel="raw_lidar_out_analog" yLabel="lidar_out_cm" selectedId={drilldown.rowId}
                      onSelect={(id, ts) => openDiagnosticsWithDrilldown({ rowId: id, bucketTimestamp: ts ? bucketTimestampString(ts, appliedFilters.bucket) : null, directionView: null, isRaining: null })} />
                  )}
                </article>

                <article style={styles.chartCard}>
                  <h3 style={styles.chartTitle}>Board Temp vs Ultrasonic In</h3>
                  {loading ? <EmptyChartState label="Loading…" /> : (
                    <ScatterChart points={boardTempVsUltrasonicIn} xKey="board_temperature" yKey="sensor_value" xLabel="board_temperature" yLabel="ultrasonic_in_cm" selectedId={drilldown.rowId}
                      onSelect={(id, ts) => openDiagnosticsWithDrilldown({ rowId: id, bucketTimestamp: ts ? bucketTimestampString(ts, appliedFilters.bucket) : null, directionView: null, isRaining: null })} />
                  )}
                </article>

                <article style={styles.chartCard}>
                  <h3 style={styles.chartTitle}>Board Temp vs Lidar Out</h3>
                  {loading ? <EmptyChartState label="Loading…" /> : (
                    <ScatterChart points={boardTempVsLidarOut} xKey="board_temperature" yKey="sensor_value" xLabel="board_temperature" yLabel="lidar_out_cm" selectedId={drilldown.rowId}
                      onSelect={(id, ts) => openDiagnosticsWithDrilldown({ rowId: id, bucketTimestamp: ts ? bucketTimestampString(ts, appliedFilters.bucket) : null, directionView: null, isRaining: null })} />
                  )}
                </article>
              </div>
            </section>

            {/* Global Filters + Full Table */}
            <section style={styles.panel}>
              <h2 style={styles.panelTitle}>Global Filters</h2>
              <div style={styles.filterGrid}>
                <label style={styles.label}>Start time
                  <input type="datetime-local" value={draftFilters.startTime} onChange={(e) => setDraftFilters((p) => ({ ...p, startTime: e.target.value }))} style={styles.input} />
                </label>
                <label style={styles.label}>End time
                  <input type="datetime-local" value={draftFilters.endTime} onChange={(e) => setDraftFilters((p) => ({ ...p, endTime: e.target.value }))} style={styles.input} />
                </label>
                <label style={styles.label}>Time bucket
                  <select value={draftFilters.bucket} onChange={(e) => setDraftFilters((p) => ({ ...p, bucket: e.target.value as Bucket }))} style={styles.input}>
                    <option value="minute">Minute</option>
                    <option value="hour">Hour</option>
                    <option value="day">Day</option>
                  </select>
                </label>
                <label style={styles.label}>Direction view
                  <select value={draftFilters.directionView} onChange={(e) => setDraftFilters((p) => ({ ...p, directionView: e.target.value as DirectionFilter }))} style={styles.input}>
                    <option value="ALL">All</option>
                    <option value="IN">IN</option>
                    <option value="OUT">OUT</option>
                    <option value="FLAT">FLAT</option>
                  </select>
                </label>
                <label style={styles.label}>Rain filter
                  <select value={draftFilters.rainFilter} onChange={(e) => setDraftFilters((p) => ({ ...p, rainFilter: e.target.value as RainFilter }))} style={styles.input}>
                    <option value="ALL">All</option>
                    <option value="RAIN">Rain only</option>
                    <option value="DRY">Dry only</option>
                  </select>
                </label>
                <label style={styles.label}>Search by ID
                  <input type="text" value={draftFilters.searchId} onChange={(e) => setDraftFilters((p) => ({ ...p, searchId: e.target.value }))} placeholder="e.g. 1205" style={styles.input} />
                </label>
                <label style={styles.label}>Board temp min
                  <input type="number" value={draftFilters.boardTempMin} onChange={(e) => setDraftFilters((p) => ({ ...p, boardTempMin: e.target.value }))} style={styles.input} />
                </label>
                <label style={styles.label}>Board temp max
                  <input type="number" value={draftFilters.boardTempMax} onChange={(e) => setDraftFilters((p) => ({ ...p, boardTempMax: e.target.value }))} style={styles.input} />
                </label>
                <label style={styles.label}>Ultrasonic in min
                  <input type="number" value={draftFilters.ultrasonicInMin} onChange={(e) => setDraftFilters((p) => ({ ...p, ultrasonicInMin: e.target.value }))} style={styles.input} />
                </label>
                <label style={styles.label}>Ultrasonic in max
                  <input type="number" value={draftFilters.ultrasonicInMax} onChange={(e) => setDraftFilters((p) => ({ ...p, ultrasonicInMax: e.target.value }))} style={styles.input} />
                </label>
                <label style={styles.label}>Ultrasonic out min
                  <input type="number" value={draftFilters.ultrasonicOutMin} onChange={(e) => setDraftFilters((p) => ({ ...p, ultrasonicOutMin: e.target.value }))} style={styles.input} />
                </label>
                <label style={styles.label}>Ultrasonic out max
                  <input type="number" value={draftFilters.ultrasonicOutMax} onChange={(e) => setDraftFilters((p) => ({ ...p, ultrasonicOutMax: e.target.value }))} style={styles.input} />
                </label>
                <label style={styles.label}>Lidar in min
                  <input type="number" value={draftFilters.lidarInMin} onChange={(e) => setDraftFilters((p) => ({ ...p, lidarInMin: e.target.value }))} style={styles.input} />
                </label>
                <label style={styles.label}>Lidar in max
                  <input type="number" value={draftFilters.lidarInMax} onChange={(e) => setDraftFilters((p) => ({ ...p, lidarInMax: e.target.value }))} style={styles.input} />
                </label>
                <label style={styles.label}>Lidar out min
                  <input type="number" value={draftFilters.lidarOutMin} onChange={(e) => setDraftFilters((p) => ({ ...p, lidarOutMin: e.target.value }))} style={styles.input} />
                </label>
                <label style={styles.label}>Lidar out max
                  <input type="number" value={draftFilters.lidarOutMax} onChange={(e) => setDraftFilters((p) => ({ ...p, lidarOutMax: e.target.value }))} style={styles.input} />
                </label>
              </div>
              <div style={styles.actionRow}>
                <button type="button" style={styles.applyButton} onClick={() => { setAppliedFilters({ ...draftFilters, limit: 5000, offset: 0 }); setDrilldown({ bucketTimestamp: null, directionView: null, isRaining: null, rowId: null }); setTablePage(0) }} disabled={loading}>
                  {loading ? 'Loading…' : 'Apply filters'}
                </button>
                <button type="button" style={styles.resetButton} onClick={() => { setDraftFilters(INITIAL_FILTERS); setAppliedFilters(INITIAL_FILTERS); setDrilldown({ bucketTimestamp: null, directionView: null, isRaining: null, rowId: null }); setTablePage(0) }}>
                  Reset
                </button>
                <button type="button" style={styles.exportButton} onClick={() => exportCsv(pageRows)} disabled={pageRows.length === 0}>
                  Export this page
                </button>
                <button type="button" style={styles.resetButton} onClick={() => exportPresetReport('daily')} disabled={reportLoading !== null}>
                  {reportLoading === 'daily' ? 'Exporting…' : 'Export daily report'}
                </button>
                <button type="button" style={styles.resetButton} onClick={() => exportPresetReport('weekly')} disabled={reportLoading !== null}>
                  {reportLoading === 'weekly' ? 'Exporting…' : 'Export weekly report'}
                </button>
              </div>
            </section>

            <p style={styles.modeBadge}>Full Parking Logs Table</p>
            <p style={styles.tableNote}>All columns including derived metrics. Click chart points in Live Monitor to drilldown.</p>

            <div style={styles.actionRow}>
              <button type="button" style={styles.resetButton} onClick={() => setDrilldown({ bucketTimestamp: null, directionView: null, isRaining: null, rowId: null })}>
                Clear drilldown
              </button>
              <button type="button" style={styles.applyButton} onClick={() => setDrilldown((p) => ({ ...p, directionView: 'OUT', rowId: null }))}>
                Show OUT only
              </button>
              <button type="button" style={styles.applyButton} onClick={() => setDrilldown((p) => ({ ...p, directionView: 'IN', rowId: null }))}>
                Show IN only
              </button>
            </div>

            {drilldownChips.length > 0 && (
              <div style={styles.chipRow}>
                {drilldownChips.map((chip) => <span key={chip} style={styles.chip}>{chip}</span>)}
              </div>
            )}

            <div style={styles.paginationRow}>
              <span style={styles.paginationText}>
                {tableRows.length > 0 ? `Showing ${startIdx + 1}–${startIdx + pageRows.length} of ${tableRows.length} rows` : 'No rows'}
              </span>
              <div style={styles.paginationButtons}>
                <button type="button" style={styles.pageButton} onClick={() => setTablePage(0)} disabled={currentPage === 0}>{'<<'}</button>
                <button type="button" style={styles.pageButton} onClick={() => setTablePage((p) => Math.max(p - 1, 0))} disabled={currentPage === 0}>{'<'}</button>
                <span style={styles.paginationText}>Page {currentPage + 1} / {totalTablePages}</span>
                <button type="button" style={styles.pageButton} onClick={() => setTablePage((p) => Math.min(p + 1, totalTablePages - 1))} disabled={currentPage >= totalTablePages - 1}>{'>'}</button>
                <button type="button" style={styles.pageButton} onClick={() => setTablePage(totalTablePages - 1)} disabled={currentPage >= totalTablePages - 1}>{'>>'}</button>
              </div>
            </div>

            <DataTable rows={pageRows} />
          </section>
        )}
      </section>
    </main>
  )
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(140deg, #f8f2e7 0%, #efe2cf 45%, #f3ecd9 100%)',
    position: 'relative',
    overflow: 'hidden',
  },
  heroBlob: {
    position: 'absolute',
    top: -160, right: -120,
    width: 580, height: 580,
    borderRadius: '50%',
    background: 'radial-gradient(circle at center, rgba(217,119,6,0.22), rgba(217,119,6,0))',
    pointerEvents: 'none',
  },
  container: {
    width: 'min(1320px, 94vw)',
    margin: '0 auto',
    padding: '28px 0 56px 0',
    position: 'relative',
    zIndex: 1,
  },
  header: { marginBottom: 14 },
  eyebrow: {
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontSize: '0.79rem',
    color: '#7c4b1f',
    fontWeight: 700,
  },
  title: {
    margin: '8px 0 10px 0',
    color: '#1e2f23',
    fontSize: 'clamp(1.7rem, 3.8vw, 3rem)',
    lineHeight: 1.05,
  },
  tabRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  tabButton: {
    border: '1px solid #c79e70',
    borderRadius: 999,
    padding: '8px 14px',
    background: '#fff7eb',
    color: '#6f3f12',
    fontWeight: 700,
    cursor: 'pointer',
  },
  tabButtonActive: { border: '1px solid #173d31', background: '#173d31', color: '#fff' },
  bannerBtn: {
    border: '1px solid currentColor',
    borderRadius: 6,
    padding: '3px 10px',
    background: 'rgba(255,255,255,0.6)',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: '0.82rem',
  },
  panel: {
    background: 'rgba(255,250,242,0.92)',
    border: '1px solid rgba(122,80,40,0.22)',
    borderRadius: 16,
    padding: 16,
    boxShadow: '0 8px 24px rgba(70,45,22,0.1)',
    marginBottom: 14,
  },
  panelTitle: { margin: '0 0 10px 0', color: '#173d31', fontSize: '1.08rem' },
  filterGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 10 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.78rem', color: '#3f2e1e', fontWeight: 700 },
  input: { border: '1px solid #d9b88d', borderRadius: 10, padding: '9px 10px', background: '#fffefa', color: '#2e241b', fontSize: '0.9rem' },
  actionRow: { marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' },
  applyButton: { border: 'none', borderRadius: 10, background: '#173d31', color: '#fff', fontWeight: 700, padding: '10px 14px', cursor: 'pointer' },
  resetButton: { border: '1px solid #c79e70', borderRadius: 10, background: '#fff3e1', color: '#6f3f12', fontWeight: 700, padding: '10px 14px', cursor: 'pointer' },
  exportButton: { border: 'none', borderRadius: 10, background: '#d9480f', color: '#fff', fontWeight: 700, padding: '10px 14px', cursor: 'pointer' },
  errorBox: { background: '#fde2e1', border: '1px solid #ef4444', borderRadius: 12, color: '#7f1d1d', padding: 12, marginBottom: 12 },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(172px, 1fr))', gap: 10, marginBottom: 14 },
  kpiCard: { background: '#fffdf7', border: '1px solid rgba(111,78,55,0.2)', borderRadius: 14, padding: '12px 14px' },
  kpiTitle: { margin: 0, color: '#6f4e37', fontSize: '0.77rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 },
  kpiValue: { margin: '8px 0 0 0', color: '#163a31', fontWeight: 700, fontSize: '1.24rem' },
  kpiValueMuted: { margin: '8px 0 0 0', color: '#aaa', fontWeight: 700, fontSize: '1rem' },
  kpiSub: { margin: '4px 0 0 0', color: '#5c4633', fontSize: '0.78rem' },
  chartGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 10, marginBottom: 14 },
  chartCard: { background: '#fffdf8', border: '1px solid rgba(111,78,55,0.2)', borderRadius: 14, padding: 12, minHeight: 290 },
  chartCardWide: { gridColumn: '1 / -1', background: '#fffdf8', border: '1px solid rgba(111,78,55,0.2)', borderRadius: 14, padding: 12 },
  chartTitle: { margin: '0 0 10px 0', color: '#163a31', fontSize: '0.99rem' },
  chartWrap: { width: '100%' },
  svgChart: { width: '100%', height: 220, display: 'block' },
  emptyState: {
    minHeight: 150,
    border: '1px dashed #cfb08b',
    borderRadius: 12,
    background: '#fff8ed',
    color: '#7b5f44',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: 700,
  },
  legendRow: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', color: '#4a3a2b', marginTop: 8, fontSize: '0.82rem' },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: '50%', display: 'inline-block' },
  heatmapWrap: { width: '100%', overflowX: 'auto' },
  heatmapTable: { borderCollapse: 'collapse', minWidth: 980, width: '100%' },
  heatmapHeaderCell: { border: '1px solid #dbbf98', padding: '6px 8px', background: '#f8ead6', color: '#2d2217', fontSize: '0.76rem', textAlign: 'left', whiteSpace: 'nowrap' },
  heatmapCell: { border: '1px solid #dbbf98', padding: '6px 8px', color: '#fff', fontSize: '0.75rem', textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 700 },
  tableWrap: { width: '100%', overflowX: 'auto' },
  table: { width: '100%', minWidth: 1800, borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid #dbbf98', background: '#f8ead6', color: '#2d2217', fontSize: '0.82rem', position: 'sticky', top: 0 },
  td: { padding: '8px', borderBottom: '1px solid #eedcc7', color: '#302519', fontSize: '0.8rem', whiteSpace: 'nowrap' },
  modeBadge: { margin: '0 0 6px 0', color: '#7a4b1d', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' },
  tableNote: { margin: '0 0 8px 0', color: '#5c4633', fontSize: '0.84rem' },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { borderRadius: 999, border: '1px solid #d3b48e', background: '#f7e9d5', color: '#3f2e1e', padding: '5px 10px', fontSize: '0.8rem', fontWeight: 700 },
  paginationRow: { marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  paginationText: { fontSize: '0.84rem', color: '#5c4633', fontWeight: 700 },
  paginationButtons: { display: 'flex', alignItems: 'center', gap: 6 },
  pageButton: { border: '1px solid #d3b48e', borderRadius: 8, background: '#fff8ef', color: '#3f2e1e', fontWeight: 700, fontSize: '0.86rem', padding: '6px 10px', cursor: 'pointer' },
}
