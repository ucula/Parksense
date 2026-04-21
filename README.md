<a id="readme-top"></a>

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <h1 align="center">🚗 ParkSense</h1>

  <p align="center">
    <strong>Intelligent car parking availability monitoring using IoT sensors + machine learning</strong>
    <br />
    Real-time occupancy insights, anomaly diagnostics, and prediction-ready analytics.
  </p>

  <p align="center">
    <a href="https://docs.google.com/document/d/1GHHl_l5Vo-CsSAlA_s1dFEQFTqM1IijSv1jyiw_WpEk/edit?tab=t.0">
      <img src="https://img.shields.io/badge/Explore-Project%20Docs-0ea5e9?style=for-the-badge" alt="Explore Project Docs" />
    </a>
    <a href="https://docs.google.com/document/d/1ahNNu1b3PGR8sIsEEBoCvRBRc65DTKKkgZlgHrcnEi8/edit?tab=t.0">
      <img src="https://img.shields.io/badge/Setup-IoT%20Sensor%20Guide-2563eb?style=for-the-badge" alt="IoT Sensor Setup Guide" />
    </a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#iot-sensor-setup-guide">IoT Sensor Setup Guide</a></li>
        <li><a href="#installation">Installation</a></li>
        <li><a href="#troubleshooting">Troubleshooting</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->
## About The Project

Finding a car parking spot during morning rush hours is a daily frustration for university students. ParkSense aims to monitor and predict car parking availability using privacy-friendly, low-cost IoT sensors connected to a KidBright32iP microcontroller.

Instead of relying on expensive and privacy-intrusive cameras, ParkSense utilizes motion and distance sensors to measure the flow of vehicles and lane blockages as proxies for parking density.

This primary sensor data is integrated with secondary contextual data, such as real-time weather conditions and university class schedules. By applying machine learning models, the system generates a "Parking Availability Probability" and classifies the lot status (e.g., Full, Moderate, Available). The processed insights are exposed via a standard Web API and visualized on an interactive dashboard, allowing students to check parking conditions before arriving at the campus.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

* [![Next][Next.js]][Next-url]
* [![React][React.js]][React-url]
* [![FastAPI][FastAPI.tiangolo.com]][FastAPI-url]
* [![Python][Python.org]][Python-url]
* [![MySQL][MySQL.org]][MySQL-url]
* [![Docker][Docker.com]][Docker-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->
## Getting Started

This section provides instructions on setting up ParkSense locally. Follow these steps to get a copy up and running.

### Prerequisites

* Docker and Docker Compose installed
* Node.js 20+ (for local frontend development)
* Python 3.10+ (for local backend development)
* Git

### IoT Sensor Setup Guide

This repository focuses on visualizing processed data and serving it through the API/dashboard stack.

For end-to-end IoT deployment details (sensor hardware setup, microcontroller configuration, calibration, and data collection flow), follow the dedicated guide:

[IoT sensor setup guide »](https://docs.google.com/document/d/1ahNNu1b3PGR8sIsEEBoCvRBRc65DTKKkgZlgHrcnEi8/edit?tab=t.0)

### Installation

1. Clone the repository
   ```sh
   git clone https://github.com/yourusername/ParkSense.git
   cd ParkSense
   ```

2. Create a `.env` file in the project root, then set values for your environment:

```env
DB_USER=<your_db_user>
DB_PASSWORD=<your_db_password>
DB_NAME=<your_db_name>
DB_HOST=<your_db_host>
DB_PORT=3306
BACKEND_PORT=8000
FRONTEND_PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:8000
DEBUG=False

# Optional CSV fallback (recommended for local development if DB is unavailable)
# PARK_LOGS_CSV=../database/parking_logs.csv
```

> Important: keep `NEXT_PUBLIC_API_URL` without a trailing slash.

3. Ensure your MySQL database is reachable.

  This repository's `docker-compose.yml` starts **backend + frontend only** (no MySQL container).

4. Start all services using Docker Compose:

```sh
docker compose up --build
```

5. Access the application:
  - Frontend: http://localhost:3000
  - Backend API: http://localhost:8000
  - API Documentation: http://localhost:8000/docs

**For Local Development (without Docker):**

**Backend:**
```sh
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

> If you want CSV fallback mode locally, set `PARK_LOGS_CSV` to a valid file path (for example `../database/parking_logs.csv`).

**Frontend:**
```sh
cd frontend
npm install
npm run dev
```

### Troubleshooting

- **Frontend shows `Error: Not Found`**
  - Confirm `NEXT_PUBLIC_API_URL` is exactly `http://localhost:8000` (no trailing `/`).
  - Confirm backend is running and reachable at `http://localhost:8000/health`.

- **Backend starts but dashboard returns 500**
  - Verify DB credentials in `.env` are correct.
  - If DB is not available, set `PARK_LOGS_CSV` to a valid CSV path.

- **No data shown**
  - Ensure your DB has a compatible `parking_logs` or `park_logs` table.
  - Or provide CSV data through `PARK_LOGS_CSV`.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE EXAMPLES -->
## Usage

### Checking Parking Availability

1. Open the dashboard at http://localhost:3000
2. Use filters and tabs to explore live, insights, analytics, and diagnostics views
3. View real-time availability status, anomaly flags, and prediction metrics
4. Check historical trends and peak hours

### API Usage

Get all parking logs:
```sh
curl "http://localhost:8000/api/parkinglogs?limit=50&offset=0&sort=asc"
```

Get dashboard payload from park_logs:
```sh
curl "http://localhost:8000/api/park-logs/dashboard?bucket=hour&offset=0&sort=asc"
```

Get reports (lookback):
```sh
curl "http://localhost:8000/api/park-logs/reports?unit=month&count=1&sort=asc"
```

Get analytics summary:
```sh
curl "http://localhost:8000/api/park-logs/analytics"
```

Get ML inference metrics:
```sh
curl "http://localhost:8000/api/park-logs/ml-inference"
```

Get sensor health:
```sh
curl "http://localhost:8000/api/park-logs/sensor-health"
```

Check API health:
```sh
curl http://localhost:8000/health
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>


## License

Distributed under the MIT License. See `LICENSE` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>


## Acknowledgments

- FastAPI documentation and community examples
- Next.js documentation and ecosystem
- KU IoT coursework context and sensor experimentation

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
[Next.js]: https://img.shields.io/badge/next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white
[React.js]: https://img.shields.io/badge/react-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[FastAPI.tiangolo.com]: https://img.shields.io/badge/fastapi-009688?style=for-the-badge&logo=fastapi&logoColor=white
[Python.org]: https://img.shields.io/badge/python-3776AB?style=for-the-badge&logo=python&logoColor=ffdd54
[MySQL.org]: https://img.shields.io/badge/mysql-4479A1?style=for-the-badge&logo=mysql&logoColor=white
[Docker.com]: https://img.shields.io/badge/docker-2496ED?style=for-the-badge&logo=docker&logoColor=white
[Next-url]: https://nextjs.org/
[React-url]: https://reactjs.org/
[FastAPI-url]: https://fastapi.tiangolo.com/
[Python-url]: https://www.python.org/
[MySQL-url]: https://www.mysql.com/
[Docker-url]: https://www.docker.com/