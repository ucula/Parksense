'use client'

import React from 'react'
import Link from 'next/link'

export default function Home(): React.ReactElement {
  return (
    <div style={styles.container}>
        <div style={styles.headerContainer}>
          <div>
            <h1>🅿️ ParkSense Dashboard</h1>
            <p>Intelligent Car Parking Availability Monitoring System</p>
          </div>
          <Link href="/database" style={styles.dbButton}>
            View Database
          </Link>
        </div>

        <div style={styles.grid}>
          <div style={styles.card}>
            <h3>📊 Live Data</h3>
            <p>Real-time parking lot sensor data and vehicle counting information</p>
            <Link href="/database" style={styles.link}>
              View All Records →
            </Link>
          </div>

          <div style={styles.card}>
            <h3>🔌 API Endpoint</h3>
            <p>
              Access parking data via <code>/api/parkinglogs</code>
            </p>
            <code style={styles.code}>GET http://localhost:8000/api/parkinglogs</code>
          </div>
        </div>
      </div>
    )
  }

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    fontFamily: 'Arial, sans-serif',
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  headerContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '40px',
  },
  dbButton: {
    padding: '12px 24px',
    backgroundColor: '#4CAF50',
    color: 'white',
    textDecoration: 'none',
    borderRadius: '4px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background-color 0.3s',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
    marginTop: '20px',
  },
  card: {
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '20px',
    backgroundColor: '#f9f9f9',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  link: {
    color: '#4CAF50',
    textDecoration: 'none',
    fontWeight: 'bold',
    marginTop: '10px',
    display: 'inline-block',
  },
  code: {
    backgroundColor: '#f0f0f0',
    padding: '8px 12px',
    borderRadius: '4px',
    fontFamily: 'monospace',
    display: 'block',
    marginTop: '8px',
    fontSize: '12px',
  },
}
