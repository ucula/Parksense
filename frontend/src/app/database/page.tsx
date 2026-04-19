'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API_BASE_URL } from '@/constants';

const PAGE_SIZE = 20;

interface ParkingLog {
  id: number;
  timestamp: string;
  in_count: number;
  out_count: number;
  net_flow: number;
  current_vehicles: number;
  parking_percentage: number;
  api_feels_like: number;
  api_humidity: number;
  api_clouds: number;
  api_temperature: number;
  board_temperature: number;
  is_raining: boolean;
  pir_in_trigger: number;
  raw_ultrasonic_in_us: number;
  ultrasonic_in_cm: number;
  raw_lidar_in_analog: number;
  pir_out_trigger: number;
  raw_ultrasonic_out_us: number;
  ultrasonic_out_cm: number;
  raw_lidar_out_analog: number;
  lidar_in_cm: number;
  lidar_out_cm: number;
}

const TABLE_COLUMNS: Array<{
  key: keyof ParkingLog;
  label: string;
  kind?: 'datetime' | 'bool' | 'float';
}> = [
  { key: 'id', label: 'id' },
  { key: 'timestamp', label: 'timestamp', kind: 'datetime' },
  { key: 'in_count', label: 'in_count' },
  { key: 'out_count', label: 'out_count' },
  { key: 'net_flow', label: 'net_flow' },
  { key: 'current_vehicles', label: 'current_vehicles' },
  { key: 'parking_percentage', label: 'parking_percentage', kind: 'float' },
  { key: 'api_feels_like', label: 'api_feels_like', kind: 'float' },
  { key: 'api_humidity', label: 'api_humidity' },
  { key: 'api_clouds', label: 'api_clouds' },
  { key: 'api_temperature', label: 'api_temperature', kind: 'float' },
  { key: 'board_temperature', label: 'board_temperature', kind: 'float' },
  { key: 'is_raining', label: 'is_raining', kind: 'bool' },
  { key: 'pir_in_trigger', label: 'pir_in_trigger' },
  { key: 'raw_ultrasonic_in_us', label: 'raw_ultrasonic_in_us' },
  { key: 'ultrasonic_in_cm', label: 'ultrasonic_in_cm', kind: 'float' },
  { key: 'raw_lidar_in_analog', label: 'raw_lidar_in_analog' },
  { key: 'pir_out_trigger', label: 'pir_out_trigger' },
  { key: 'raw_ultrasonic_out_us', label: 'raw_ultrasonic_out_us' },
  { key: 'ultrasonic_out_cm', label: 'ultrasonic_out_cm', kind: 'float' },
  { key: 'raw_lidar_out_analog', label: 'raw_lidar_out_analog' },
  { key: 'lidar_in_cm', label: 'lidar_in_cm', kind: 'float' },
  { key: 'lidar_out_cm', label: 'lidar_out_cm', kind: 'float' },
];

function formatCellValue(column: (typeof TABLE_COLUMNS)[number], value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }

  if (column.kind === 'datetime') {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  if (column.kind === 'bool') {
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (typeof value === 'number') {
      return value !== 0 ? 'true' : 'false';
    }
    const normalized = String(value).trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 't'].includes(normalized) ? 'true' : 'false';
  }

  if (column.kind === 'float') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(2) : String(value);
  }

  return String(value);
}

export default function DatabasePage() {
  const [parkingLogs, setParkingLogs] = useState<ParkingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);

  useEffect(() => {
    const fetchParkingLogs = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch one extra row to determine whether a next page exists.
        const offset = currentPage * PAGE_SIZE;
        const response = await fetch(
          `${API_BASE_URL}/api/parkinglogs?limit=${PAGE_SIZE + 1}&offset=${offset}`,
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch parking logs: ${response.statusText}`);
        }
        const data = await response.json();
        const rows = Array.isArray(data) ? data : [];
        setHasNextPage(rows.length > PAGE_SIZE);
        setParkingLogs(rows.slice(0, PAGE_SIZE));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
        console.error('Error fetching parking logs:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchParkingLogs();
  }, [currentPage]);

  const startRow = currentPage * PAGE_SIZE + 1;
  const endRow = currentPage * PAGE_SIZE + parkingLogs.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800">Parking Logs Viewer</h1>
          <Link href="/" className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors">
            Back to Dashboard
          </Link>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6">
            <p className="font-bold">Error</p>
            <p>{error}</p>
          </div>
        )}

        {/* Parking Logs Table */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              {parkingLogs.length > 0 ? `Showing ${startRow}-${endRow}` : 'No rows'}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 0))}
                disabled={loading || currentPage === 0}
                className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                aria-label="Previous page"
              >
                &lt;
              </button>
              <span className="text-sm text-gray-700 min-w-16 text-center">Page {currentPage + 1}</span>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => prev + 1)}
                disabled={loading || !hasNextPage}
                className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                aria-label="Next page"
              >
                &gt;
              </button>
            </div>
          </div>

          {parkingLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {loading ? 'Loading parking logs...' : 'No parking logs found in database'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-indigo-600 text-white sticky top-0">
                  <tr>
                    {TABLE_COLUMNS.map((column) => (
                      <th key={column.key} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {parkingLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      {TABLE_COLUMNS.map((column) => (
                        <td key={`${log.id}-${column.key}`} className="px-3 py-2 text-gray-700 text-xs whitespace-nowrap">
                          {formatCellValue(column, log[column.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
