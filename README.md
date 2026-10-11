<p align="center">
  <img src="https://img.shields.io/badge/AWS-Hackathon_2026-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/Leaflet-199900?style=for-the-badge&logo=leaflet&logoColor=white" />
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" />
</p>

<h1 align="center">🌿 Clean Air Navigation</h1>

<p align="center">
  <strong>Pollution-aware routing for urban commuters</strong><br/>
  <em>Because the fastest route isn't always the healthiest.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/AQI_Reduction-76%25-0f9d58?style=flat-square" />
  <img src="https://img.shields.io/badge/Status-Live-0f9d58?style=flat-square" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" />
</p>

---

## 🎯 Problem Statement

Urban commuters unknowingly expose themselves to dangerously high levels of air pollution during their daily commute. Traditional navigation apps optimize for distance or time — **but never for the air you breathe**.

> A person commuting through a polluted corridor (AQI 200+) inhales **4x more PM2.5 particles** than someone on a cleaner, slightly longer route.

## 💡 Our Solution

**Clean Air Navigation** computes three types of routes between any two locations:

| Route Type | Optimized For | Example |
|------------|--------------|---------|
| 🟢 **Clean Route** | Lowest AQI exposure | Through parks & residential areas |
| 🔵 **Fastest Route** | Shortest distance | Through traffic corridors |
| 🟡 **Balanced Route** | Best of both worlds | Weighted combination |

### ✨ Key Features

- **🗺️ Google Maps-style UI** — Familiar left-panel interface with interactive map
- **📊 Health Impact Dashboard** — PM2.5 dose, cigarette equivalents, WHO guideline comparison
- **🫁 Risk Score Gauges** — Visual respiratory risk assessment for each route
- **💰 Annual Savings Calculator** — See yearly health cost savings
- **📡 Real-time AQI Monitoring** — Live sensor data with trend indicators
- **🔄 Interactive Routing** — Select any start/end from 10 Bangalore neighborhoods
- **📱 Responsive Design** — Works on desktop and mobile

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (:5173)                         │
│  React + Leaflet + Tailwind CSS                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐│
│  │ Map View │  │ Route    │  │ Health   │  │ Live AQI         ││
│  │ Polylines│  │ Compare  │  │ Impact   │  │ Dashboard        ││
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘│
└─────────────────────────┬───────────────────────────────────────┘
                          │ REST API
┌─────────────────────────▼───────────────────────────────────────┐
│                        BACKEND (:8000)                           │
│  FastAPI + Python                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐│
│  │ Dijkstra │  │ Health   │  │ Live AQI │  │ Annual Savings   ││
│  │ Router   │  │ Calc     │  │ Simulator│  │ Calculator       ││
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘│
│                                                                  │
│  Urban Graph: 10 nodes, 18 edges (Bangalore)                     │
└──────────────────────────────────────────────────────────────────┘
                          │
            ┌─────────────▼─────────────┐
            │  AWS demo deployment      │
            │  ┌────────┐ ┌───────────┐ │
            │  │Amplify │ │ App Runner│ │
            │  │React UI│ │ FastAPI   │ │
            │  └────────┘ └───────────┘ │
            │     simulated AQI data    │
            └───────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- npm 9+

### 1. Clone & Install

```bash
git clone https://github.com/thekiku/pollution-maps.git
cd pollution-maps

# Backend
pip install fastapi "uvicorn[standard]"

# Frontend
cd frontend
npm install
cd ..
```

### 2. Run

```bash
# Terminal 1 — Backend
python -m uvicorn backend.main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm run dev
```

### 3. Open

Navigate to **http://localhost:5173** 🎉

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/route` | GET | Get fastest, clean & balanced routes |
| `/api/v1/nodes` | GET | List all graph nodes |
| `/api/v1/aqi/live` | GET | Real-time AQI readings |
| `/api/v1/health/annual-savings` | GET | Annual health savings calculator |

### Example Request

```bash
curl "http://localhost:8000/api/v1/route?start=Koramangala&end=Whitefield"
```

### Example Response

```json
{
  "fastest_route": {
    "path": ["Koramangala", "Marathahalli", "Whitefield"],
    "total_distance_km": 13.5,
    "avg_aqi": 202,
    "health_impact": {
      "risk_level": "Hazardous",
      "cigarette_equivalent": 0.058,
      "pm25_dose_ug": 49.14
    }
  },
  "clean_route": {
    "path": ["Koramangala", "HSR Layout", "Bellandur", "Whitefield"],
    "total_distance_km": 16.5,
    "avg_aqi": 49,
    "health_impact": {
      "risk_level": "Low",
      "cigarette_equivalent": 0.013,
      "pm25_dose_ug": 12.87
    }
  },
  "health_savings": {
    "aqi_reduction_percent": 76,
    "cigarette_equivalent_saved": 0.045,
    "annual_health_cost_saved_inr": 1250
  }
}
```

## 🧠 How It Works

### Dijkstra's Algorithm with Multiple Weights

The routing engine runs Dijkstra's shortest-path algorithm multiple times with different edge weights:

- **Distance mode**: Minimizes total kilometers traveled
- **AQI mode**: Minimizes cumulative air quality index exposure
- **Balanced mode**: `weight = 0.4 × distance + 0.6 × AQI` (favors cleaner air)

### Health Impact Model

Based on WHO Air Quality Guidelines (2021):
- **PM2.5 dose** = concentration × breathing rate × exposure time
- **Cigarette equivalent** = 22 µg/m³ PM2.5 for 24h ≈ 1 cigarette
- **Risk score** = Normalized 0-100 scale based on AQI thresholds
- **Health cost** = Simplified WHO DALY-based economic model

## 🗺️ Coverage

Currently covers **10 Bangalore neighborhoods**:

| Area | Base AQI | Category |
|------|----------|----------|
| Bellandur | 40 | 🟢 Good |
| HSR Layout | 45 | 🟢 Good |
| Whitefield | 55 | 🟢 Good |
| Electronic City | 65 | 🟡 Moderate |
| Jayanagar | 75 | 🟡 Moderate |
| Koramangala | 85 | 🟡 Moderate |
| BTM Layout | 95 | 🟡 Moderate |
| Indiranagar | 110 | 🟠 Unhealthy (SG) |
| MG Road | 135 | 🟠 Unhealthy (SG) |
| Marathahalli | 180 | 🔴 Unhealthy |

## 🔮 AWS Production Roadmap

| AWS Service | Purpose |
|-------------|---------|
| **IoT Core** | Ingest real-time sensor data from air quality monitors |
| **Lambda** | Process & aggregate AQI data, run routing calculations |
| **DynamoDB** | Store historical AQI readings per location |
| **API Gateway** | RESTful API with auth, rate limiting, caching |
| **S3 + CloudFront** | Host the React frontend globally |
| **SageMaker** | ML model to predict AQI based on time, weather, traffic |
| **SNS** | Push notifications when AQI spikes on user's saved routes |

## ☁️ AWS Deployment (Hackathon Demo)

The demo is split into a static React site on **AWS Amplify Hosting** and the FastAPI service on **AWS App Runner**. The frontend reads `VITE_API_BASE_URL` at build time; the API exposes `/health` for App Runner checks and reads `ALLOWED_ORIGINS` for browser access.

### Deploy the API

1. Push this repository to a Git provider supported by App Runner and create an App Runner service from the repository.
2. Use the repository root as the source directory and `Dockerfile` as the build file. App Runner listens on port `8080`.
3. Once the service is running, copy its HTTPS service URL.

### Deploy the frontend

1. Create an Amplify Hosting app connected to the same repository, with `frontend` as the app root. The build configuration is in `frontend/amplify.yml`.
2. Set the Amplify environment variable `VITE_API_BASE_URL` to the App Runner HTTPS URL, without a trailing slash, then redeploy.
3. Set the App Runner environment variable `ALLOWED_ORIGINS` to the Amplify site origin (for example `https://main.xxxxx.amplifyapp.com`).

The included route graph and AQI readings are demo data; the live endpoint simulates sensor fluctuations. AWS hosting deploys the demo service, not an IoT sensor network.

## 👥 Team

Built with ❤️ for the AWS Hackathon 2026

## 📄 License

MIT License — see [LICENSE](LICENSE) for details
