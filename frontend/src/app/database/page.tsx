'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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

export default function DatabasePage() {
  const [parkingLogs, setParkingLogs] = useState<ParkingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchParkingLogs = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch parking logs
        const response = await fetch('http://localhost:8000/api/parkinglogs');
        if (!response.ok) {
          throw new Error(`Failed to fetch parking logs: ${response.statusText}`);
        }
        const data = await response.json();
        setParkingLogs(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
        console.error('Error fetching parking logs:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchParkingLogs();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold text-gray-800">Parking Logs Viewer</h1>
            <Link href="/" className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors">
              Back to Dashboard
            </Link>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading parking logs...</p>
          </div>
        </div>
      </div>
    );
  }

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
          {parkingLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No parking logs found in database
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-indigo-600 text-white sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">ID</th>
                    <th className="px-3 py-2 text-left font-semibold">Timestamp</th>
                    <th className="px-3 py-2 text-left font-semibold">Vehicles</th>
                    <th className="px-3 py-2 text-left font-semibold">In/Out</th>
                    <th className="px-3 py-2 text-left font-semibold">% Full</th>
                    <th className="px-3 py-2 text-left font-semibold">Temp (°C)</th>
                    <th className="px-3 py-2 text-left font-semibold">Weather</th>
                    <th className="px-3 py-2 text-left font-semibold">Sensors In</th>
                    <th className="px-3 py-2 text-left font-semibold">Sensors Out</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {parkingLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2 text-gray-800 font-semibold">{log.id}</td>
                      <td className="px-3 py-2 text-gray-700 text-xs">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-gray-700 font-semibold">
                        {log.current_vehicles}
                      </td>
                      <td className="px-3 py-2 text-gray-700 text-xs">
                        {log.in_count} / {log.out_count}
                      </td>
                      <td className="px-3 py-2 text-gray-700 font-semibold">
                        {log.parking_percentage.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {log.board_temperature.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-gray-700 text-xs">
                        {log.api_temperature.toFixed(1)}°C {log.is_raining ? '🌧️' : '☀️'}
                      </td>
                      <td className="px-3 py-2 text-gray-700 text-xs">
                        <div className="flex flex-col gap-1">
                          <span>US: {log.ultrasonic_in_cm.toFixed(1)}cm</span>
                          <span>LIDAR: {log.lidar_in_cm.toFixed(1)}cm</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            log.pir_in_trigger ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            PIR: {log.pir_in_trigger ? 'TRIGGERED' : '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-700 text-xs">
                        <div className="flex flex-col gap-1">
                          <span>US: {log.ultrasonic_out_cm.toFixed(1)}cm</span>
                          <span>LIDAR: {log.lidar_out_cm.toFixed(1)}cm</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            log.pir_out_trigger ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            PIR: {log.pir_out_trigger ? 'TRIGGERED' : '-'}
                          </span>
                        </div>
                      </td>
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
