// Application constants
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
export const APP_NAME = 'ParkSense'

export const PARKING_CAPACITY = 222

export const OCC_THRESHOLDS = { warn: 50, critical: 80 }

export const ANOMALY_THRESHOLDS = {
  sensorGapIn: 114.43,
  sensorGapOut: 114.00,
  occupancyChange: 4.0,
}

export const COLORS = {
  primary: '#1D9E75',
  warning: '#EF9F27',
  critical: '#E24B4A',
  prediction: '#378ADD',
  inFlow: '#1D9E75',
  outFlow: '#D4537E',
  netFlow: '#7F77DD',
  anomalyLow: '#EF9F27',
  anomalyMedium: '#E24B4A',
  bg: '#F1EFE8',
}

export function occColor(pct: number): string {
  if (pct >= OCC_THRESHOLDS.critical) return COLORS.critical
  if (pct >= OCC_THRESHOLDS.warn) return COLORS.warning
  return COLORS.primary
}
