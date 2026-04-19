'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE_URL } from '@/constants'

type Bucket = 'minute' | 'hour' | 'day'
type DirectionViewFilter = 'ALL' | 'IN' | 'OUT' | 'FLAT'
type RainFilter = 'ALL' | 'RAIN' | 'DRY'
type ViewTab = 'overview' | 'table'
const FULL_TABLE_PAGE_SIZE = 30

interface Filters {
  startTime: string
  endTime: string
  bucket: Bucket
  directionView: DirectionViewFilter
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
  direction_view: string
  current_vehicles: number
  net_flow: number
  sensor_gap_in: number | null
  sensor_gap_out: number | null
}

interface SensorBaselines {
  sensor_gap_in: {
    p50: number | null
    p95: number | null
  }
  sensor_gap_out: {
    p50: number | null
    p95: number | null
  }
  occupancy_change_abs: {
    p95: number | null
  }
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

const TABLE_COLUMNS: Array<{
  key: keyof ParkingLogRow
  label: string
  kind?: 'datetime' | 'bool' | 'float'
}> = [
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
  { key: 'direction_view', label: 'direction_view' },
  { key: 'occupancy_change', label: 'occupancy_change', kind: 'float' },
  { key: 'in_out_ratio', label: 'in_out_ratio', kind: 'float' },
  { key: 'sensor_gap_in', label: 'sensor_gap_in', kind: 'float' },
  { key: 'sensor_gap_out', label: 'sensor_gap_out', kind: 'float' },
]

function toNumber(value: string): number | null {
  if (!value.trim()) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatDateInput(value: string): string | null {
  if (!value) {
    return null
  }
  return `${value.replace('T', ' ')}:00`
}

function formatNumber(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) {
    return '-'
  }
  return value.toFixed(digits)
}

function formatPercentRatio(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

function formatCellValue(column: (typeof TABLE_COLUMNS)[number], value: unknown): string {
  if (value === null || value === undefined) {
    return '-'
  }

  if (column.kind === 'datetime') {
    const date = new Date(String(value))
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
  }

  if (column.kind === 'bool') {
    return value ? 'true' : 'false'
  }

  if (column.kind === 'float') {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric.toFixed(2) : String(value)
  }

  return String(value)
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

function exportCsv(rows: ParkingLogRow[]): void {
  const headers = TABLE_COLUMNS.map((column) => column.label)
  const body = rows
    .map((row) =>
      TABLE_COLUMNS.map((column) => formatCellValue(column, row[column.key]))
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
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
  if (rows.length === 0) {
    return
  }

  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  const body = rows
    .map((row) =>
      headers
        .map((header) => {
          const value = row[header]
          return `"${String(value ?? '').replace(/"/g, '""')}"`
        })
        .join(','),
    )
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

function buildReportUrl(filters: Filters, preset: 'daily' | 'weekly'): string {
  const params = new URLSearchParams()
  params.set('preset', preset)

  const start = formatDateInput(filters.startTime)
  const end = formatDateInput(filters.endTime)

  if (start) {
    params.set('start_time', start)
  }
  if (end) {
    params.set('end_time', end)
  }

  return `${API_BASE_URL}/api/park-logs/reports?${params.toString()}`
}

function buildDashboardUrl(filters: Filters): string {
  const params = new URLSearchParams()
  params.set('bucket', filters.bucket)
  params.set('offset', String(filters.offset))
  params.set('sort', 'asc')

  const start = formatDateInput(filters.startTime)
  const end = formatDateInput(filters.endTime)

  if (start) {
    params.set('start_time', start)
  }
  if (end) {
    params.set('end_time', end)
  }
  if (filters.directionView !== 'ALL') {
    params.set('direction_view', filters.directionView)
  }
  if (filters.rainFilter === 'RAIN') {
    params.set('is_raining', 'true')
  }
  if (filters.rainFilter === 'DRY') {
    params.set('is_raining', 'false')
  }

  const boardTempMin = toNumber(filters.boardTempMin)
  const boardTempMax = toNumber(filters.boardTempMax)
  const ultrasonicInMin = toNumber(filters.ultrasonicInMin)
  const ultrasonicInMax = toNumber(filters.ultrasonicInMax)
  const ultrasonicOutMin = toNumber(filters.ultrasonicOutMin)
  const ultrasonicOutMax = toNumber(filters.ultrasonicOutMax)
  const lidarInMin = toNumber(filters.lidarInMin)
  const lidarInMax = toNumber(filters.lidarInMax)
  const lidarOutMin = toNumber(filters.lidarOutMin)
  const lidarOutMax = toNumber(filters.lidarOutMax)

  if (boardTempMin !== null) {
    params.set('board_temperature_min', String(boardTempMin))
  }
  if (boardTempMax !== null) {
    params.set('board_temperature_max', String(boardTempMax))
  }
  if (ultrasonicInMin !== null) {
    params.set('ultrasonic_in_min', String(ultrasonicInMin))
  }
  if (ultrasonicInMax !== null) {
    params.set('ultrasonic_in_max', String(ultrasonicInMax))
  }
  if (ultrasonicOutMin !== null) {
    params.set('ultrasonic_out_min', String(ultrasonicOutMin))
  }
  if (ultrasonicOutMax !== null) {
    params.set('ultrasonic_out_max', String(ultrasonicOutMax))
  }
  if (lidarInMin !== null) {
    params.set('lidar_in_min', String(lidarInMin))
  }
  if (lidarInMax !== null) {
    params.set('lidar_in_max', String(lidarInMax))
  }
  if (lidarOutMin !== null) {
    params.set('lidar_out_min', String(lidarOutMin))
  }
  if (lidarOutMax !== null) {
    params.set('lidar_out_max', String(lidarOutMax))
  }
  if (filters.searchId.trim()) {
    params.set('search_id', filters.searchId.trim())
  }

  return `${API_BASE_URL}/api/park-logs/dashboard?${params.toString()}`
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

function EmptyChartState({ label }: { label: string }): React.ReactElement {
  return <div style={styles.emptyState}>{label}</div>
}

function TimeSeriesChart({
  points,
  series,
  selectedTimestamp,
  onSelectTimestamp,
  baselineZero = false,
}: {
  points: TrendPoint[]
  series: Array<{ key: keyof TrendPoint; label: string; color: string }>
  selectedTimestamp: string | null
  onSelectTimestamp: (timestamp: string) => void
  baselineZero?: boolean
}): React.ReactElement {
  const clipped = points.slice(-72)
  if (clipped.length === 0) {
    return <EmptyChartState label="No data in selected range" />
  }

  const width = 760
  const height = 260
  const padding = 34

  const numericValues = clipped.flatMap((point) =>
    series
      .map((line) => {
        const value = point[line.key]
        return typeof value === 'number' ? value : null
      })
      .filter((value): value is number => value !== null),
  )

  if (numericValues.length === 0) {
    return <EmptyChartState label="No numeric values for this chart" />
  }

  const minY = Math.min(...numericValues, baselineZero ? 0 : Number.POSITIVE_INFINITY)
  const maxY = Math.max(...numericValues, baselineZero ? 0 : Number.NEGATIVE_INFINITY)
  const yRange = Math.max(maxY - minY, 1)

  const getX = (index: number) =>
    clipped.length === 1
      ? padding + (width - padding * 2) / 2
      : padding + (index / (clipped.length - 1)) * (width - padding * 2)

  const getY = (value: number) =>
    height - padding - ((value - minY) / yRange) * (height - padding * 2)

  return (
    <div style={styles.chartWrap}>
      <svg viewBox={`0 0 ${width} ${height}`} style={styles.svgChart}>
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#8b6b4c" strokeWidth="1" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#8b6b4c" strokeWidth="1" />

        {baselineZero ? (
          <line
            x1={padding}
            y1={getY(0)}
            x2={width - padding}
            y2={getY(0)}
            stroke="#9ea6a8"
            strokeDasharray="4 3"
            strokeWidth="1"
          />
        ) : null}

        {series.map((line) => {
          const path = clipped
            .map((point, index) => {
              const value = point[line.key]
              if (typeof value !== 'number') {
                return null
              }
              return `${index === 0 ? 'M' : 'L'} ${getX(index)} ${getY(value)}`
            })
            .filter((item): item is string => Boolean(item))
            .join(' ')

          return <path key={line.label} d={path} fill="none" stroke={line.color} strokeWidth="2.4" />
        })}

        {clipped.map((point, index) => {
          const value = point[series[0].key]
          if (typeof value !== 'number') {
            return null
          }

          return (
            <circle
              key={`${point.timestamp}-marker`}
              cx={getX(index)}
              cy={getY(value)}
              r={selectedTimestamp === point.timestamp ? 5.2 : 3.5}
              fill={selectedTimestamp === point.timestamp ? '#0c2d26' : '#184b3f'}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectTimestamp(point.timestamp)}
            >
              <title>{point.timestamp}</title>
            </circle>
          )
        })}
      </svg>

      <div style={styles.legendRow}>
        {series.map((line) => (
          <span key={line.label} style={styles.legendItem}>
            <i style={{ ...styles.legendDot, background: line.color }} />
            {line.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function ScatterChart<T extends { id: number; timestamp?: string | null }>({
  points,
  xKey,
  yKey,
  xLabel,
  yLabel,
  selectedId,
  onSelect,
  palette,
}: {
  points: T[]
  xKey: string
  yKey: string
  xLabel: string
  yLabel: string
  selectedId: number | null
  onSelect: (id: number, timestamp: string | null) => void
  palette?: (point: T) => string
}): React.ReactElement {
  const valid = points
    .map((point) => {
      const pointRecord = point as Record<string, unknown>
      const x = pointRecord[xKey]
      const y = pointRecord[yKey]
      const id = point.id
      if (typeof x !== 'number' || typeof y !== 'number' || typeof id !== 'number') {
        return null
      }
      return {
        id,
        x,
        y,
        timestamp: typeof point.timestamp === 'string' ? point.timestamp : null,
        point,
      }
    })
    .filter((point): point is { id: number; x: number; y: number; timestamp: string | null; point: T } => point !== null)
    .slice(0, 1400)

  if (valid.length === 0) {
    return <EmptyChartState label="No scatter points" />
  }

  const width = 760
  const height = 260
  const padding = 36

  const minX = Math.min(...valid.map((point) => point.x))
  const maxX = Math.max(...valid.map((point) => point.x))
  const minY = Math.min(...valid.map((point) => point.y))
  const maxY = Math.max(...valid.map((point) => point.y))

  const xRange = Math.max(maxX - minX, 1)
  const yRange = Math.max(maxY - minY, 1)

  const getX = (value: number) => padding + ((value - minX) / xRange) * (width - padding * 2)
  const getY = (value: number) => height - padding - ((value - minY) / yRange) * (height - padding * 2)

  return (
    <div style={styles.chartWrap}>
      <svg viewBox={`0 0 ${width} ${height}`} style={styles.svgChart}>
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#8b6b4c" strokeWidth="1" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#8b6b4c" strokeWidth="1" />

        {valid.map((point) => {
          const color = palette ? palette(point.point) : '#146356'
          return (
            <circle
              key={point.id}
              cx={getX(point.x)}
              cy={getY(point.y)}
              r={selectedId === point.id ? 4.8 : 3.1}
              fill={color}
              opacity={selectedId === point.id ? 1 : 0.78}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelect(point.id, point.timestamp)}
            >
              <title>{`${xLabel}: ${point.x.toFixed(2)} | ${yLabel}: ${point.y.toFixed(2)}`}</title>
            </circle>
          )
        })}
      </svg>

      <div style={styles.legendRow}>
        <span style={styles.legendItem}>X: {xLabel}</span>
        <span style={styles.legendItem}>Y: {yLabel}</span>
      </div>
    </div>
  )
}

function DataTable({ rows }: { rows: ParkingLogRow[] }): React.ReactElement {
  if (rows.length === 0) {
    return <EmptyChartState label="No rows for selected filters and drilldown" />
  }

  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            {TABLE_COLUMNS.map((column) => (
              <th key={column.key} style={styles.th}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {TABLE_COLUMNS.map((column) => (
                <td key={`${row.id}-${column.key}`} style={styles.td}>
                  {formatCellValue(column, row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CorrelationHeatmap({
  matrix,
}: {
  matrix: CorrelationMatrix | null
}): React.ReactElement {
  if (!matrix || matrix.metrics.length === 0 || matrix.pairs.length === 0) {
    return <EmptyChartState label="No correlation matrix" />
  }

  const valueMap = new Map<string, number | null>()
  for (const pair of matrix.pairs) {
    valueMap.set(`${pair.x}::${pair.y}`, pair.value)
  }

  const colorFor = (value: number | null): string => {
    if (value === null) {
      return '#f3e7d7'
    }
    if (value >= 0.7) {
      return '#0f766e'
    }
    if (value >= 0.3) {
      return '#34a0a4'
    }
    if (value > -0.3) {
      return '#f59e0b'
    }
    if (value > -0.7) {
      return '#fb7185'
    }
    return '#be123c'
  }

  return (
    <div style={styles.heatmapWrap}>
      <table style={styles.heatmapTable}>
        <thead>
          <tr>
            <th style={styles.heatmapHeaderCell}>metric</th>
            {matrix.metrics.map((metric) => (
              <th key={metric} style={styles.heatmapHeaderCell}>{metric}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.metrics.map((rowMetric) => (
            <tr key={rowMetric}>
              <th style={styles.heatmapHeaderCell}>{rowMetric}</th>
              {matrix.metrics.map((columnMetric) => {
                const value = valueMap.get(`${rowMetric}::${columnMetric}`) ?? null
                return (
                  <td
                    key={`${rowMetric}-${columnMetric}`}
                    style={{
                      ...styles.heatmapCell,
                      background: colorFor(value),
                    }}
                    title={`${rowMetric} vs ${columnMetric} = ${value === null ? 'n/a' : value.toFixed(3)}`}
                  >
                    {value === null ? 'n/a' : value.toFixed(2)}
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

function AnomalyTable({
  rows,
  onSelect,
}: {
  rows: AnomalyFlag[]
  onSelect: (id: number, timestamp: string) => void
}): React.ReactElement {
  if (rows.length === 0) {
    return <EmptyChartState label="No anomaly flags in selected range" />
  }

  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Severity</th>
            <th style={styles.th}>Timestamp</th>
            <th style={styles.th}>ID</th>
            <th style={styles.th}>Reasons</th>
            <th style={styles.th}>Direction</th>
            <th style={styles.th}>Current Vehicles</th>
            <th style={styles.th}>Net Flow</th>
            <th style={styles.th}>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 120).map((row) => (
            <tr key={`${row.id}-${row.timestamp}`}>
              <td style={styles.td}>{row.severity}</td>
              <td style={styles.td}>{new Date(row.timestamp).toLocaleString()}</td>
              <td style={styles.td}>{row.id}</td>
              <td style={styles.td}>{row.reasons.join(', ')}</td>
              <td style={styles.td}>{row.direction_view}</td>
              <td style={styles.td}>{row.current_vehicles}</td>
              <td style={styles.td}>{row.net_flow}</td>
              <td style={styles.td}>
                <button
                  type="button"
                  style={styles.applyButton}
                  onClick={() => onSelect(row.id, row.timestamp)}
                >
                  Drilldown
                </button>
              </td>
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
  const [activeTab, setActiveTab] = useState<ViewTab>('overview')
  const [tablePage, setTablePage] = useState(0)
  const [reportLoading, setReportLoading] = useState<'daily' | 'weekly' | null>(null)
  const tableSectionRef = useRef<HTMLElement | null>(null)
  const [drilldown, setDrilldown] = useState<DrilldownState>({
    bucketTimestamp: null,
    directionView: null,
    isRaining: null,
    rowId: null,
  })

  const { data, loading, error } = useDashboardData(appliedFilters)

  const openTableWithDrilldown = (patch: Partial<DrilldownState>): void => {
    setDrilldown((prev) => ({ ...prev, ...patch }))
    setTablePage(0)
    setActiveTab('table')
  }

  const exportPresetReport = async (preset: 'daily' | 'weekly'): Promise<void> => {
    try {
      setReportLoading(preset)
      const response = await fetch(buildReportUrl(appliedFilters, preset))
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.detail || `Unable to export ${preset} report`)
      }

      const reportRows = Array.isArray(payload?.rows) ? payload.rows : []
      exportObjectRowsAsCsv(reportRows, `parking_logs_${preset}_report_${new Date().toISOString()}.csv`)
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : `Unable to export ${preset} report`
      window.alert(message)
    } finally {
      setReportLoading(null)
    }
  }

  const trendPoints = data?.trends || []

  const tableRows = useMemo(() => {
    if (!data) {
      return []
    }

    return data.logs.filter((row) => {
      if (drilldown.rowId !== null && row.id !== drilldown.rowId) {
        return false
      }
      if (
        drilldown.bucketTimestamp &&
        bucketTimestampString(row.timestamp, appliedFilters.bucket) !== drilldown.bucketTimestamp
      ) {
        return false
      }
      if (drilldown.directionView && row.direction_view !== drilldown.directionView) {
        return false
      }
      if (drilldown.isRaining !== null && row.is_raining !== drilldown.isRaining) {
        return false
      }
      return true
    })
  }, [data, drilldown, appliedFilters.bucket])

  const totalTablePages = Math.max(1, Math.ceil(tableRows.length / FULL_TABLE_PAGE_SIZE))
  const currentTablePage = Math.min(tablePage, totalTablePages - 1)
  const tableStartIndex = currentTablePage * FULL_TABLE_PAGE_SIZE
  const tablePageRows = tableRows.slice(tableStartIndex, tableStartIndex + FULL_TABLE_PAGE_SIZE)
  const tableStartRow = tableRows.length > 0 ? tableStartIndex + 1 : 0
  const tableEndRow = tableStartIndex + tablePageRows.length

  const drilldownChips = useMemo(() => {
    const chips: string[] = []
    if (drilldown.bucketTimestamp) {
      chips.push(`Time: ${drilldown.bucketTimestamp}`)
    }
    if (drilldown.directionView) {
      chips.push(`Direction: ${drilldown.directionView}`)
    }
    if (drilldown.isRaining !== null) {
      chips.push(`Rain: ${drilldown.isRaining ? 'rainy' : 'dry'}`)
    }
    if (drilldown.rowId !== null) {
      chips.push(`ID: ${drilldown.rowId}`)
    }
    return chips
  }, [drilldown])

  const boardTempVsUltrasonicIn = useMemo(
    () =>
      (data?.board_temp_sensor_scatter || []).map((point) => ({
        id: point.id,
        timestamp: point.timestamp,
        board_temperature: point.board_temperature,
        sensor_value: point.ultrasonic_in_cm,
      })),
    [data],
  )

  const boardTempVsLidarOut = useMemo(
    () =>
      (data?.board_temp_sensor_scatter || []).map((point) => ({
        id: point.id,
        timestamp: point.timestamp,
        board_temperature: point.board_temperature,
        sensor_value: point.lidar_out_cm,
      })),
    [data],
  )

  useEffect(() => {
    if (activeTab === 'table') {
      tableSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [activeTab])

  useEffect(() => {
    setTablePage(0)
  }, [drilldown, appliedFilters])

  return (
    <main style={styles.page}>
      <div style={styles.heroBlob} />
      <section style={styles.container}>
        <header style={styles.header}>
          <div>
            <p style={styles.eyebrow}>Parking Logs Dashboard</p>
            <h1 style={styles.title}>Occupancy, Weather, and Sensor Diagnostics</h1>
          </div>
        </header>

        <section style={styles.tabRow}>
          <button
            type="button"
            style={{
              ...styles.tabButton,
              ...(activeTab === 'overview' ? styles.tabButtonActive : {}),
            }}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            style={{
              ...styles.tabButton,
              ...(activeTab === 'table' ? styles.tabButtonActive : {}),
            }}
            onClick={() => {
              setTablePage(0)
              setActiveTab('table')
            }}
          >
            Full Table
          </button>
        </section>

        {error ? <section style={styles.errorBox}>Error: {error}</section> : null}

        {activeTab === 'overview' ? (
          <>
            <section style={styles.kpiGrid}>
              <KpiCard title="Total Logs" value={String(data?.kpis.total_logs ?? 0)} />
              <KpiCard title="Current Vehicles (Latest)" value={String(data?.kpis.current_vehicles_latest ?? 0)} />
              <KpiCard
                title="Avg Parking Percentage"
                value={`${formatNumber(data?.kpis.avg_parking_percentage ?? null)}%`}
              />
              <KpiCard title="Total In / Total Out" value={`${data?.kpis.total_in ?? 0} / ${data?.kpis.total_out ?? 0}`} />
              <KpiCard title="Latest Net Flow" value={String(data?.kpis.latest_net_flow ?? 0)} />
              <KpiCard title="Rain Ratio" value={formatPercentRatio(data?.kpis.rain_ratio ?? 0)} />
              <KpiCard
                title="Avg Board Temperature"
                value={`${formatNumber(data?.kpis.avg_board_temperature ?? null)} C`}
              />
              <KpiCard title="Returned Rows" value={`${data?.returned_logs ?? 0}/${data?.total_filtered_logs ?? 0}`} />
            </section>

            <section style={styles.chartGrid}>
              <article style={styles.chartCard}>
                <h3 style={styles.chartTitle}>Occupancy Trend</h3>
                {loading ? (
                  <EmptyChartState label="Loading chart..." />
                ) : (
                  <TimeSeriesChart
                    points={trendPoints}
                    series={[{ key: 'current_vehicles', label: 'Current Vehicles', color: '#0f766e' }]}
                    selectedTimestamp={drilldown.bucketTimestamp}
                    onSelectTimestamp={(timestamp) =>
                      openTableWithDrilldown({ bucketTimestamp: timestamp, rowId: null })
                    }
                  />
                )}
              </article>

              <article style={styles.chartCard}>
                <h3 style={styles.chartTitle}>Parking Percentage Trend</h3>
                {loading ? (
                  <EmptyChartState label="Loading chart..." />
                ) : (
                  <TimeSeriesChart
                    points={trendPoints}
                    series={[{ key: 'parking_percentage', label: 'Parking %', color: '#d97706' }]}
                    selectedTimestamp={drilldown.bucketTimestamp}
                    onSelectTimestamp={(timestamp) =>
                      openTableWithDrilldown({ bucketTimestamp: timestamp, rowId: null })
                    }
                  />
                )}
              </article>

              <article style={styles.chartCardWide}>
                <h3 style={styles.chartTitle}>In/Out and Net Flow</h3>
                {loading ? (
                  <EmptyChartState label="Loading chart..." />
                ) : (
                  <TimeSeriesChart
                    points={trendPoints}
                    series={[
                      { key: 'in_count', label: 'IN', color: '#ea580c' },
                      { key: 'out_count', label: 'OUT', color: '#0284c7' },
                      { key: 'net_flow', label: 'Net Flow', color: '#4338ca' },
                    ]}
                    selectedTimestamp={drilldown.bucketTimestamp}
                    onSelectTimestamp={(timestamp) =>
                      openTableWithDrilldown({ bucketTimestamp: timestamp, rowId: null })
                    }
                    baselineZero
                  />
                )}
              </article>

              <article style={styles.chartCardWide}>
                <h3 style={styles.chartTitle}>Weather Trend Panel</h3>
                {loading ? (
                  <EmptyChartState label="Loading chart..." />
                ) : (
                  <TimeSeriesChart
                    points={trendPoints}
                    series={[
                      { key: 'api_temperature', label: 'Temperature', color: '#c2410c' },
                      { key: 'api_feels_like', label: 'Feels Like', color: '#dc2626' },
                      { key: 'api_humidity', label: 'Humidity', color: '#0284c7' },
                      { key: 'api_clouds', label: 'Clouds', color: '#475569' },
                    ]}
                    selectedTimestamp={drilldown.bucketTimestamp}
                    onSelectTimestamp={(timestamp) =>
                      openTableWithDrilldown({ bucketTimestamp: timestamp, rowId: null })
                    }
                  />
                )}
              </article>

              <article style={styles.chartCard}>
                <h3 style={styles.chartTitle}>Rain vs Occupancy</h3>
                <div style={styles.rainGrid}>
                  <button
                    type="button"
                    style={styles.rainCard}
                    onClick={() => openTableWithDrilldown({ isRaining: true, rowId: null })}
                  >
                    <p style={styles.rainTitle}>Rainy snapshots</p>
                    <p style={styles.rainValue}>{data?.rain_vs_occupancy.raining_logs ?? 0}</p>
                    <p style={styles.rainSub}>Avg occupancy {formatNumber(data?.rain_vs_occupancy.raining_avg_current_vehicles ?? null)}</p>
                  </button>
                  <button
                    type="button"
                    style={styles.rainCard}
                    onClick={() => openTableWithDrilldown({ isRaining: false, rowId: null })}
                  >
                    <p style={styles.rainTitle}>Dry snapshots</p>
                    <p style={styles.rainValue}>{data?.rain_vs_occupancy.dry_logs ?? 0}</p>
                    <p style={styles.rainSub}>Avg occupancy {formatNumber(data?.rain_vs_occupancy.dry_avg_current_vehicles ?? null)}</p>
                  </button>
                </div>
              </article>

              <article style={styles.chartCard}>
                <h3 style={styles.chartTitle}>Direction Breakdown</h3>
                <div style={styles.breakdownStack}>
                  {Object.entries(data?.direction_breakdown || {}).map(([key, count]) => (
                    <button
                      key={key}
                      type="button"
                      style={styles.breakdownItem}
                      onClick={() => openTableWithDrilldown({ directionView: key, rowId: null })}
                    >
                      <span>{key}</span>
                      <strong>{count}</strong>
                    </button>
                  ))}
                </div>
              </article>

              <article style={styles.chartCardWide}>
                <h3 style={styles.chartTitle}>Temperature vs Parking Percentage</h3>
                {loading ? (
                  <EmptyChartState label="Loading chart..." />
                ) : (
                  <ScatterChart
                    points={data?.temp_vs_parking_scatter || []}
                    xKey="api_temperature"
                    yKey="parking_percentage"
                    xLabel="Api Temperature"
                    yLabel="Parking %"
                    selectedId={drilldown.rowId}
                    onSelect={(id, timestamp) =>
                      openTableWithDrilldown({
                        rowId: id,
                        bucketTimestamp: timestamp ? bucketTimestampString(timestamp, appliedFilters.bucket) : null,
                        directionView: null,
                        isRaining: null,
                      })
                    }
                    palette={(point) => ((point.is_raining as boolean) ? '#0ea5e9' : '#f97316')}
                  />
                )}
              </article>

              <article style={styles.chartCard}>
                <h3 style={styles.chartTitle}>Inbound Sensor Trend</h3>
                {loading ? (
                  <EmptyChartState label="Loading chart..." />
                ) : (
                  <TimeSeriesChart
                    points={trendPoints}
                    series={[
                      { key: 'ultrasonic_in_cm', label: 'Ultrasonic In (cm)', color: '#0891b2' },
                      { key: 'lidar_in_cm', label: 'Lidar In (cm)', color: '#16a34a' },
                      { key: 'pir_in_trigger', label: 'PIR In Trigger', color: '#dc2626' },
                    ]}
                    selectedTimestamp={drilldown.bucketTimestamp}
                    onSelectTimestamp={(timestamp) =>
                      openTableWithDrilldown({ bucketTimestamp: timestamp, rowId: null })
                    }
                  />
                )}
              </article>

              <article style={styles.chartCard}>
                <h3 style={styles.chartTitle}>Outbound Sensor Trend</h3>
                {loading ? (
                  <EmptyChartState label="Loading chart..." />
                ) : (
                  <TimeSeriesChart
                    points={trendPoints}
                    series={[
                      { key: 'ultrasonic_out_cm', label: 'Ultrasonic Out (cm)', color: '#0284c7' },
                      { key: 'lidar_out_cm', label: 'Lidar Out (cm)', color: '#22c55e' },
                      { key: 'pir_out_trigger', label: 'PIR Out Trigger', color: '#be123c' },
                    ]}
                    selectedTimestamp={drilldown.bucketTimestamp}
                    onSelectTimestamp={(timestamp) =>
                      openTableWithDrilldown({ bucketTimestamp: timestamp, rowId: null })
                    }
                  />
                )}
              </article>

              <article style={styles.chartCard}>
                <h3 style={styles.chartTitle}>Raw vs Converted: Ultrasonic In</h3>
                {loading ? (
                  <EmptyChartState label="Loading chart..." />
                ) : (
                  <ScatterChart
                    points={data?.raw_vs_converted_checks.ultrasonic_in || []}
                    xKey="raw"
                    yKey="converted"
                    xLabel="raw_ultrasonic_in_us"
                    yLabel="ultrasonic_in_cm"
                    selectedId={drilldown.rowId}
                    onSelect={(id, timestamp) =>
                      openTableWithDrilldown({
                        rowId: id,
                        bucketTimestamp: timestamp ? bucketTimestampString(timestamp, appliedFilters.bucket) : null,
                        directionView: null,
                        isRaining: null,
                      })
                    }
                  />
                )}
              </article>

              <article style={styles.chartCard}>
                <h3 style={styles.chartTitle}>Raw vs Converted: Ultrasonic Out</h3>
                {loading ? (
                  <EmptyChartState label="Loading chart..." />
                ) : (
                  <ScatterChart
                    points={data?.raw_vs_converted_checks.ultrasonic_out || []}
                    xKey="raw"
                    yKey="converted"
                    xLabel="raw_ultrasonic_out_us"
                    yLabel="ultrasonic_out_cm"
                    selectedId={drilldown.rowId}
                    onSelect={(id, timestamp) =>
                      openTableWithDrilldown({
                        rowId: id,
                        bucketTimestamp: timestamp ? bucketTimestampString(timestamp, appliedFilters.bucket) : null,
                        directionView: null,
                        isRaining: null,
                      })
                    }
                  />
                )}
              </article>

              <article style={styles.chartCard}>
                <h3 style={styles.chartTitle}>Raw vs Converted: Lidar In</h3>
                {loading ? (
                  <EmptyChartState label="Loading chart..." />
                ) : (
                  <ScatterChart
                    points={data?.raw_vs_converted_checks.lidar_in || []}
                    xKey="raw"
                    yKey="converted"
                    xLabel="raw_lidar_in_analog"
                    yLabel="lidar_in_cm"
                    selectedId={drilldown.rowId}
                    onSelect={(id, timestamp) =>
                      openTableWithDrilldown({
                        rowId: id,
                        bucketTimestamp: timestamp ? bucketTimestampString(timestamp, appliedFilters.bucket) : null,
                        directionView: null,
                        isRaining: null,
                      })
                    }
                  />
                )}
              </article>

              <article style={styles.chartCard}>
                <h3 style={styles.chartTitle}>Raw vs Converted: Lidar Out</h3>
                {loading ? (
                  <EmptyChartState label="Loading chart..." />
                ) : (
                  <ScatterChart
                    points={data?.raw_vs_converted_checks.lidar_out || []}
                    xKey="raw"
                    yKey="converted"
                    xLabel="raw_lidar_out_analog"
                    yLabel="lidar_out_cm"
                    selectedId={drilldown.rowId}
                    onSelect={(id, timestamp) =>
                      openTableWithDrilldown({
                        rowId: id,
                        bucketTimestamp: timestamp ? bucketTimestampString(timestamp, appliedFilters.bucket) : null,
                        directionView: null,
                        isRaining: null,
                      })
                    }
                  />
                )}
              </article>

              <article style={styles.chartCard}>
                <h3 style={styles.chartTitle}>Board Temp vs Ultrasonic In</h3>
                {loading ? (
                  <EmptyChartState label="Loading chart..." />
                ) : (
                  <ScatterChart
                    points={boardTempVsUltrasonicIn}
                    xKey="board_temperature"
                    yKey="sensor_value"
                    xLabel="board_temperature"
                    yLabel="ultrasonic_in_cm"
                    selectedId={drilldown.rowId}
                    onSelect={(id, timestamp) =>
                      openTableWithDrilldown({
                        rowId: id,
                        bucketTimestamp: timestamp ? bucketTimestampString(timestamp, appliedFilters.bucket) : null,
                        directionView: null,
                        isRaining: null,
                      })
                    }
                  />
                )}
              </article>

              <article style={styles.chartCard}>
                <h3 style={styles.chartTitle}>Board Temp vs Lidar Out</h3>
                {loading ? (
                  <EmptyChartState label="Loading chart..." />
                ) : (
                  <ScatterChart
                    points={boardTempVsLidarOut}
                    xKey="board_temperature"
                    yKey="sensor_value"
                    xLabel="board_temperature"
                    yLabel="lidar_out_cm"
                    selectedId={drilldown.rowId}
                    onSelect={(id, timestamp) =>
                      openTableWithDrilldown({
                        rowId: id,
                        bucketTimestamp: timestamp ? bucketTimestampString(timestamp, appliedFilters.bucket) : null,
                        directionView: null,
                        isRaining: null,
                      })
                    }
                  />
                )}
              </article>

              <article style={styles.chartCardWide}>
                <h3 style={styles.chartTitle}>Correlation Matrix (Phase 2)</h3>
                {loading ? <EmptyChartState label="Loading matrix..." /> : <CorrelationHeatmap matrix={data?.correlation_matrix || null} />}
              </article>

              <article style={styles.chartCard}>
                <h3 style={styles.chartTitle}>Sensor Baseline Thresholds (Phase 2)</h3>
                <div style={styles.breakdownStack}>
                  <div style={styles.breakdownItem}>
                    <span>Sensor Gap In p95</span>
                    <strong>{formatNumber(data?.sensor_baselines.sensor_gap_in.p95 ?? null)}</strong>
                  </div>
                  <div style={styles.breakdownItem}>
                    <span>Sensor Gap Out p95</span>
                    <strong>{formatNumber(data?.sensor_baselines.sensor_gap_out.p95 ?? null)}</strong>
                  </div>
                  <div style={styles.breakdownItem}>
                    <span>Occupancy Change p95</span>
                    <strong>{formatNumber(data?.sensor_baselines.occupancy_change_abs.p95 ?? null)}</strong>
                  </div>
                </div>
              </article>

              <article style={styles.chartCardWide}>
                <h3 style={styles.chartTitle}>Anomaly Flags (Phase 2)</h3>
                {loading ? (
                  <EmptyChartState label="Loading anomalies..." />
                ) : (
                  <AnomalyTable
                    rows={data?.anomaly_flags || []}
                    onSelect={(id, timestamp) =>
                      openTableWithDrilldown({
                        rowId: id,
                        bucketTimestamp: bucketTimestampString(timestamp, appliedFilters.bucket),
                        directionView: null,
                        isRaining: null,
                      })
                    }
                  />
                )}
              </article>
            </section>
          </>
        ) : (
          <section style={styles.tablePanel} ref={tableSectionRef}>
            <section style={styles.panel}>
              <h2 style={styles.panelTitle}>Global Filters</h2>
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
                    onChange={(event) =>
                      setDraftFilters((prev) => ({ ...prev, bucket: event.target.value as Bucket }))
                    }
                    style={styles.input}
                  >
                    <option value="minute">Minute</option>
                    <option value="hour">Hour</option>
                    <option value="day">Day</option>
                  </select>
                </label>
                <label style={styles.label}>
                  Direction view
                  <select
                    value={draftFilters.directionView}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({
                        ...prev,
                        directionView: event.target.value as DirectionViewFilter,
                      }))
                    }
                    style={styles.input}
                  >
                    <option value="ALL">All</option>
                    <option value="IN">IN</option>
                    <option value="OUT">OUT</option>
                    <option value="FLAT">FLAT</option>
                  </select>
                </label>
                <label style={styles.label}>
                  Rain filter
                  <select
                    value={draftFilters.rainFilter}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({ ...prev, rainFilter: event.target.value as RainFilter }))
                    }
                    style={styles.input}
                  >
                    <option value="ALL">All</option>
                    <option value="RAIN">Rain only</option>
                    <option value="DRY">Dry only</option>
                  </select>
                </label>
                <label style={styles.label}>
                  Search by ID
                  <input
                    type="text"
                    value={draftFilters.searchId}
                    onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchId: event.target.value }))}
                    placeholder="e.g. 1205"
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
                  Ultrasonic in min
                  <input
                    type="number"
                    value={draftFilters.ultrasonicInMin}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({ ...prev, ultrasonicInMin: event.target.value }))
                    }
                    style={styles.input}
                  />
                </label>
                <label style={styles.label}>
                  Ultrasonic in max
                  <input
                    type="number"
                    value={draftFilters.ultrasonicInMax}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({ ...prev, ultrasonicInMax: event.target.value }))
                    }
                    style={styles.input}
                  />
                </label>
                <label style={styles.label}>
                  Ultrasonic out min
                  <input
                    type="number"
                    value={draftFilters.ultrasonicOutMin}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({ ...prev, ultrasonicOutMin: event.target.value }))
                    }
                    style={styles.input}
                  />
                </label>
                <label style={styles.label}>
                  Ultrasonic out max
                  <input
                    type="number"
                    value={draftFilters.ultrasonicOutMax}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({ ...prev, ultrasonicOutMax: event.target.value }))
                    }
                    style={styles.input}
                  />
                </label>
                <label style={styles.label}>
                  Lidar in min
                  <input
                    type="number"
                    value={draftFilters.lidarInMin}
                    onChange={(event) => setDraftFilters((prev) => ({ ...prev, lidarInMin: event.target.value }))}
                    style={styles.input}
                  />
                </label>
                <label style={styles.label}>
                  Lidar in max
                  <input
                    type="number"
                    value={draftFilters.lidarInMax}
                    onChange={(event) => setDraftFilters((prev) => ({ ...prev, lidarInMax: event.target.value }))}
                    style={styles.input}
                  />
                </label>
                <label style={styles.label}>
                  Lidar out min
                  <input
                    type="number"
                    value={draftFilters.lidarOutMin}
                    onChange={(event) => setDraftFilters((prev) => ({ ...prev, lidarOutMin: event.target.value }))}
                    style={styles.input}
                  />
                </label>
                <label style={styles.label}>
                  Lidar out max
                  <input
                    type="number"
                    value={draftFilters.lidarOutMax}
                    onChange={(event) => setDraftFilters((prev) => ({ ...prev, lidarOutMax: event.target.value }))}
                    style={styles.input}
                  />
                </label>
              </div>

              <div style={styles.actionRow}>
                <button
                  type="button"
                  style={styles.applyButton}
                  onClick={() => {
                    setAppliedFilters({ ...draftFilters, limit: 5000, offset: 0 })
                    setDrilldown({ bucketTimestamp: null, directionView: null, isRaining: null, rowId: null })
                    setTablePage(0)
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
                    setDrilldown({ bucketTimestamp: null, directionView: null, isRaining: null, rowId: null })
                    setTablePage(0)
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  style={styles.exportButton}
                  onClick={() => exportCsv(tablePageRows)}
                  disabled={tablePageRows.length === 0}
                >
                  Export this page
                </button>
                <button
                  type="button"
                  style={styles.resetButton}
                  onClick={() => exportPresetReport('daily')}
                  disabled={reportLoading !== null}
                >
                  {reportLoading === 'daily' ? 'Exporting daily...' : 'Export daily report'}
                </button>
                <button
                  type="button"
                  style={styles.resetButton}
                  onClick={() => exportPresetReport('weekly')}
                  disabled={reportLoading !== null}
                >
                  {reportLoading === 'weekly' ? 'Exporting weekly...' : 'Export weekly report'}
                </button>
              </div>
            </section>

            <p style={styles.modeBadge}>FULL TABLE MODE</p>
            <h2 style={styles.panelTitle}>Full parking_logs Table</h2>
            <p style={styles.tableNote}>
              Includes all 23 parking_logs columns plus derived metrics. Click any chart point to apply drilldown filters.
            </p>
            <div style={styles.actionRow}>
              <button
                type="button"
                style={styles.resetButton}
                onClick={() =>
                  setDrilldown({ bucketTimestamp: null, directionView: null, isRaining: null, rowId: null })
                }
              >
                Clear drilldown
              </button>
              <button
                type="button"
                style={styles.applyButton}
                onClick={() => setDrilldown((prev) => ({ ...prev, directionView: 'OUT', rowId: null }))}
              >
                Show OUT only
              </button>
              <button
                type="button"
                style={styles.applyButton}
                onClick={() => setDrilldown((prev) => ({ ...prev, directionView: 'IN', rowId: null }))}
              >
                Show IN only
              </button>
            </div>
            {drilldownChips.length > 0 ? (
              <div style={styles.chipRow}>
                {drilldownChips.map((chip) => (
                  <span key={chip} style={styles.chip}>
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
            <div style={styles.paginationRow}>
              <span style={styles.paginationText}>
                {tableRows.length > 0
                  ? `Showing ${tableStartRow}-${tableEndRow} of ${tableRows.length} rows`
                  : 'No rows'}
              </span>
              <div style={styles.paginationButtons}>
                <button
                  type="button"
                  style={styles.pageButton}
                  onClick={() => setTablePage(0)}
                  disabled={currentTablePage === 0 || tableRows.length === 0}
                >
                  {'<<'}
                </button>
                <button
                  type="button"
                  style={styles.pageButton}
                  onClick={() => setTablePage((prev) => Math.max(prev - 1, 0))}
                  disabled={currentTablePage === 0 || tableRows.length === 0}
                >
                  {'<'}
                </button>
                <span style={styles.paginationText}>Page {currentTablePage + 1} / {totalTablePages}</span>
                <button
                  type="button"
                  style={styles.pageButton}
                  onClick={() => setTablePage((prev) => Math.min(prev + 1, totalTablePages - 1))}
                  disabled={currentTablePage >= totalTablePages - 1 || tableRows.length === 0}
                >
                  {'>'}
                </button>
                <button
                  type="button"
                  style={styles.pageButton}
                  onClick={() => setTablePage(totalTablePages - 1)}
                  disabled={currentTablePage >= totalTablePages - 1 || tableRows.length === 0}
                >
                  {'>>'}
                </button>
              </div>
            </div>
            <DataTable rows={tablePageRows} />
          </section>
        )}
      </section>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(140deg, #f8f2e7 0%, #efe2cf 45%, #f3ecd9 100%)',
    position: 'relative',
    overflow: 'hidden',
  },
  heroBlob: {
    position: 'absolute',
    top: -160,
    right: -120,
    width: 580,
    height: 580,
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
  header: {
    marginBottom: '14px',
  },
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
  subtitle: {
    margin: 0,
    maxWidth: '860px',
    color: '#433221',
    lineHeight: 1.45,
  },
  sourceText: {
    margin: '8px 0 0 0',
    color: '#4f4234',
    fontSize: '0.82rem',
    fontWeight: 700,
  },
  tabRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '12px',
  },
  tabButton: {
    border: '1px solid #c79e70',
    borderRadius: '999px',
    padding: '8px 14px',
    background: '#fff7eb',
    color: '#6f3f12',
    fontWeight: 700,
    cursor: 'pointer',
  },
  tabButtonActive: {
    border: '1px solid #173d31',
    background: '#173d31',
    color: '#fff',
  },
  panel: {
    background: 'rgba(255, 250, 242, 0.92)',
    border: '1px solid rgba(122, 80, 40, 0.22)',
    borderRadius: '16px',
    padding: '16px',
    boxShadow: '0 8px 24px rgba(70, 45, 22, 0.1)',
    marginBottom: '14px',
  },
  panelTitle: {
    margin: '0 0 10px 0',
    color: '#173d31',
    fontSize: '1.08rem',
  },
  filterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
    gap: '10px',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '0.78rem',
    color: '#3f2e1e',
    fontWeight: 700,
  },
  input: {
    border: '1px solid #d9b88d',
    borderRadius: '10px',
    padding: '9px 10px',
    background: '#fffefa',
    color: '#2e241b',
    fontSize: '0.9rem',
  },
  actionRow: {
    marginTop: '12px',
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  applyButton: {
    border: 'none',
    borderRadius: '10px',
    background: '#173d31',
    color: '#fff',
    fontWeight: 700,
    padding: '10px 14px',
    cursor: 'pointer',
  },
  resetButton: {
    border: '1px solid #c79e70',
    borderRadius: '10px',
    background: '#fff3e1',
    color: '#6f3f12',
    fontWeight: 700,
    padding: '10px 14px',
    cursor: 'pointer',
  },
  exportButton: {
    border: 'none',
    borderRadius: '10px',
    background: '#d9480f',
    color: '#fff',
    fontWeight: 700,
    padding: '10px 14px',
    cursor: 'pointer',
  },
  errorBox: {
    background: '#fde2e1',
    border: '1px solid #ef4444',
    borderRadius: '12px',
    color: '#7f1d1d',
    padding: '12px',
    marginBottom: '12px',
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(172px, 1fr))',
    gap: '10px',
    marginBottom: '14px',
  },
  kpiCard: {
    background: '#fffdf7',
    border: '1px solid rgba(111, 78, 55, 0.2)',
    borderRadius: '14px',
    padding: '12px 14px',
  },
  kpiTitle: {
    margin: 0,
    color: '#6f4e37',
    fontSize: '0.77rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 700,
  },
  kpiValue: {
    margin: '8px 0 0 0',
    color: '#163a31',
    fontWeight: 700,
    fontSize: '1.24rem',
  },
  chartGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '10px',
    marginBottom: '14px',
  },
  chartCard: {
    background: '#fffdf8',
    border: '1px solid rgba(111, 78, 55, 0.2)',
    borderRadius: '14px',
    padding: '12px',
    minHeight: '290px',
  },
  chartCardWide: {
    gridColumn: '1 / -1',
    background: '#fffdf8',
    border: '1px solid rgba(111, 78, 55, 0.2)',
    borderRadius: '14px',
    padding: '12px',
  },
  chartTitle: {
    margin: '0 0 10px 0',
    color: '#163a31',
    fontSize: '0.99rem',
  },
  chartWrap: {
    width: '100%',
  },
  svgChart: {
    width: '100%',
    height: '220px',
    display: 'block',
  },
  emptyState: {
    minHeight: '150px',
    border: '1px dashed #cfb08b',
    borderRadius: '12px',
    background: '#fff8ed',
    color: '#7b5f44',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: 700,
  },
  legendRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    alignItems: 'center',
    color: '#4a3a2b',
    marginTop: '8px',
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
  rainGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '8px',
  },
  rainCard: {
    border: '1px solid #d3b48e',
    borderRadius: '12px',
    background: '#fff8ef',
    textAlign: 'left',
    cursor: 'pointer',
    padding: '12px',
  },
  rainTitle: {
    margin: 0,
    color: '#6a4a2d',
    fontSize: '0.82rem',
    fontWeight: 700,
  },
  rainValue: {
    margin: '6px 0',
    color: '#173d31',
    fontSize: '1.34rem',
    fontWeight: 700,
  },
  rainSub: {
    margin: 0,
    color: '#4a3726',
    fontSize: '0.84rem',
  },
  breakdownStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  breakdownItem: {
    border: '1px solid #d3b48e',
    borderRadius: '10px',
    background: '#fff8ef',
    color: '#2e241b',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '9px 10px',
    cursor: 'pointer',
  },
  tablePanel: {
    background: '#fffdf8',
    border: '1px solid rgba(111, 78, 55, 0.2)',
    borderRadius: '14px',
    padding: '12px',
  },
  modeBadge: {
    margin: '0 0 6px 0',
    color: '#7a4b1d',
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  tableNote: {
    margin: '0 0 8px 0',
    color: '#5c4633',
    fontSize: '0.84rem',
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '10px',
  },
  chip: {
    borderRadius: '999px',
    border: '1px solid #d3b48e',
    background: '#f7e9d5',
    color: '#3f2e1e',
    padding: '5px 10px',
    fontSize: '0.8rem',
    fontWeight: 700,
  },
  paginationRow: {
    marginBottom: '10px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  paginationText: {
    fontSize: '0.84rem',
    color: '#5c4633',
    fontWeight: 700,
  },
  paginationButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  pageButton: {
    border: '1px solid #d3b48e',
    borderRadius: '8px',
    background: '#fff8ef',
    color: '#3f2e1e',
    fontWeight: 700,
    fontSize: '0.86rem',
    padding: '6px 10px',
    cursor: 'pointer',
  },
  tableWrap: {
    width: '100%',
    overflowX: 'auto',
  },
  heatmapWrap: {
    width: '100%',
    overflowX: 'auto',
  },
  heatmapTable: {
    borderCollapse: 'collapse',
    minWidth: '980px',
    width: '100%',
  },
  heatmapHeaderCell: {
    border: '1px solid #dbbf98',
    padding: '6px 8px',
    background: '#f8ead6',
    color: '#2d2217',
    fontSize: '0.76rem',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  },
  heatmapCell: {
    border: '1px solid #dbbf98',
    padding: '6px 8px',
    color: '#fff',
    fontSize: '0.75rem',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    fontWeight: 700,
  },
  table: {
    width: '100%',
    minWidth: '1800px',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '10px 8px',
    borderBottom: '1px solid #dbbf98',
    background: '#f8ead6',
    color: '#2d2217',
    fontSize: '0.82rem',
    position: 'sticky',
    top: 0,
  },
  td: {
    padding: '8px',
    borderBottom: '1px solid #eedcc7',
    color: '#302519',
    fontSize: '0.8rem',
    whiteSpace: 'nowrap',
  },
}
