<a id="readme-top"></a>

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <h3 align="center">ParkSense</h3>

  <p align="center">
    Intelligent car parking availability monitoring system using IoT sensors and machine learning
    <br />
    <a href=https://docs.google.com/document/d/1GHHl_l5Vo-CsSAlA_s1dFEQFTqM1IijSv1jyiw_WpEk/edit?tab=t.0><strong>Explore the docs »</strong></a>
    <br />
    <a href=https://docs.google.com/document/d/1ahNNu1b3PGR8sIsEEBoCvRBRc65DTKKkgZlgHrcnEi8/edit?tab=t.0><strong>IoT sensor setup guide »</strong></a>
    <br />
    <br />

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

- https://docs.google.com/document/d/1ahNNu1b3PGR8sIsEEBoCvRBRc65DTKKkgZlgHrcnEi8/edit?tab=t.0

### Installation

1. Clone the repository
   ```sh
   git clone https://github.com/yourusername/ParkSense.git
   cd ParkSense
   ```

2. Create a local `.env` from the example template:
  ```sh
  cp .env.example .env
  ```

  Then edit `.env` values for your environment:
   ```env
   DB_USER=parksense_user
   DB_PASSWORD=change_me
   DB_NAME=parksense_db
   DB_HOST=localhost
  DB_PORT=3306
  BACKEND_PORT=8000
  FRONTEND_PORT=3000
  NEXT_PUBLIC_API_URL=http://localhost:8000/
   DEBUG=False
   ```

3. Start all services using Docker Compose:
   ```sh
   docker-compose up --build
   ```

4. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs -->

**For Local Development (without Docker):**

**Backend:**
```sh
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend:**
```sh
cd frontend
npm install
npm run dev
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE EXAMPLES -->
## Usage

### Checking Parking Availability

1. Open the dashboard at http://localhost:3000
2. Select a parking lot from the map or list
3. View real-time availability status and predicted availability probability
4. Check historical trends and peak hours

### API Usage

Get all parking logs:
```sh
curl http://localhost:8000/api/parkinglogs
```

Get dashboard payload from park_logs:
```sh
curl "http://localhost:8000/api/park-logs/dashboard?bucket=hour&limit=200"
```

Check API health:
```sh
curl http://localhost:8000/health
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/yourusername/ParkSense.svg?style=for-the-badge
[contributors-url]: https://github.com/yourusername/ParkSense/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/yourusername/ParkSense.svg?style=for-the-badge
[forks-url]: https://github.com/yourusername/ParkSense/network/members
[stars-shield]: https://img.shields.io/github/stars/yourusername/ParkSense.svg?style=for-the-badge
[stars-url]: https://github.com/yourusername/ParkSense/stargazers
[issues-shield]: https://img.shields.io/github/issues/yourusername/ParkSense.svg?style=for-the-badge
[issues-url]: https://github.com/yourusername/ParkSense/issues
[license-shield]: https://img.shields.io/github/license/yourusername/ParkSense.svg?style=for-the-badge
[license-url]: https://github.com/yourusername/ParkSense/blob/main/LICENSE
[product-screenshot]: images/screenshot.png
[Next.js]: https://img.shields.io/badge/next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white
[Next-url]: https://nextjs.org/
[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://reactjs.org/
[FastAPI.tiangolo.com]: https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white
[FastAPI-url]: https://fastapi.tiangolo.com/
[Python.org]: https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white
[Python-url]: https://www.python.org/
[MySQL.org]: https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white
[MySQL-url]: https://www.mysql.com/
[Docker.com]: https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white
[Docker-url]: https://www.docker.com/
