# Mekong Sight AI

<p align="center">
  <img src="./docs/images/hero-banner.png" alt="Mekong Sight AI banner" width="100%" />
</p>

<p align="center">
  Intelligent IoT and AI decision support platform for shrimp-rice farming adaptation in the Mekong Delta.
</p>

<p align="center">
  <strong>Real-time monitoring</strong> • <strong>Salinity forecasting</strong> • <strong>Risk classification</strong> • <strong>Seasonal decision support</strong>
</p>

## Overview

Mekong Sight AI is a full-stack platform designed to help farming communities in the Mekong Delta respond to salinity intrusion and climate variability with better timing, better visibility, and better decisions.

The system combines IoT telemetry, AI-powered analytics, and a web dashboard to monitor environmental conditions, classify operational risk, and recommend actions for shrimp-rice rotation models.

## Project Highlights

- Real-time environmental monitoring for salinity, pH, temperature, and water level
- AI1 module for 7-day salinity forecasting
- AI2 module for operational risk classification
- AI3 module for seasonal transition decision support
- Web dashboard for operations, analysis, alerts, farms, users, and IoT administration
- Microservice architecture with Node.js, Python, Redis, Supabase, Docker, and Traefik

## Visual Preview

Add your screenshots here before publishing to GitHub.

<p align="center">
  <img src="./docs/images/dashboard-overview.png" alt="Dashboard overview" width="48%" />
  <img src="./docs/images/analysis-screen.png" alt="Analysis screen" width="48%" />
</p>

<p align="center">
  <img src="./docs/images/iot-monitoring.png" alt="IoT monitoring" width="48%" />
  <img src="./docs/images/alerts-screen.png" alt="Alerts screen" width="48%" />
</p>

Recommended image names:

- `docs/images/hero-banner.png`
- `docs/images/system-overview.png`
- `docs/images/dashboard-overview.png`
- `docs/images/analysis-screen.png`
- `docs/images/iot-monitoring.png`
- `docs/images/alerts-screen.png`
- `docs/images/architecture-diagram.png`

## System Overview Snapshot

<p align="center">
  <img src="./docs/images/system-overview.png" alt="System overview" width="100%" />
</p>

Use this section for a high-level platform screenshot, workflow graphic, or product overview slide that explains the full system in one frame.

## Problem Context

The Mekong Delta is increasingly affected by irregular salinity intrusion and climate change. Traditional fixed-season planning is often not enough for shrimp-rice farming systems that depend on water quality and timing.

Mekong Sight AI addresses this by turning environmental data into practical operational guidance:

- Detect abnormal conditions early
- Forecast short-term salinity trends
- Classify current risk levels
- Suggest actions for crop and water management

## Core Capabilities

### 1. IoT Monitoring

- Collects field measurements from sensor nodes
- Tracks salinity, pH, temperature, and water level
- Supports near real-time monitoring and historical review

### 2. AI1: Salinity Forecasting

- Forecasts salinity for the next 1 to 7 days
- Supports province-level and farm-level decision workflows
- Helps teams act before salinity crosses unsafe thresholds

### 3. AI2: Risk Classification

- Converts multiple environmental signals into clear risk bands
- Simplifies operator attention into low, medium, and high risk states
- Supports downstream alerting and decision logic

### 4. AI3: Decision Support

- Recommends operational actions based on forecast, risk, and crop stage
- Supports decisions such as continue rice, prepare shrimp, or emergency harvest
- Designed to help seasonal transition planning become more adaptive

## System Architecture

<p align="center">
  <img src="./docs/images/architecture-diagram.png" alt="System architecture" width="100%" />
</p>

### Main Components

- `web`: React + Vite administration dashboard
- `auth-service`: authentication and user management
- `farm-service`: farm records, seasons, alerts, and business logic
- `iot-service`: sensor ingestion, device management, and telemetry APIs
- `ai-service`: forecasting, risk scoring, reports, and AI endpoints
- `notification-service`: notification workflows
- `packages/shared`: shared configuration, middleware, validation, Redis, and utilities

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite, Axios, React Router |
| Backend | Node.js, Express, Fastify, Python, FastAPI |
| AI / Data | Pandas, NumPy, Joblib, scikit-learn style model artifacts |
| Data & Infra | Supabase, Redis, Docker, Traefik |
| Dev Tooling | npm workspaces, TypeScript, ESLint |

## Repository Structure

```text
mekong-sight-ai/
├── Backend/
│   ├── database/
│   └── service/
│       ├── ai-service/
│       ├── auth-service/
│       ├── farm-service/
│       ├── iot-service/
│       └── notification-service/
├── docs/
├── packages/
│   └── shared/
├── web/
├── docker-compose.yml
└── package.json
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm 10+
- Python 3.9+
- Docker and Docker Compose

### Local Development

```bash
npm install
npm run dev
```

Default local services used by the project:

- Web dashboard: `http://localhost:8001`
- Auth service: `http://localhost:3000`
- Farm service: `http://localhost:3001`
- IoT service: `http://localhost:3002`
- AI service: `http://localhost:8000`

## Environment Variables

Create a root `.env` file before running the full stack.

```env
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=models/gemini-2.5-flash
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=
```

## Full Deployment

This repository supports full-stack deployment with Docker Compose and Traefik.

```bash
docker compose build
docker compose up -d
```

Production entry points:

- Web app: `http://YOUR_SERVER_IP/`
- Traefik dashboard: `http://YOUR_SERVER_IP:8080/`

Detailed deployment notes are available in [docs/full-deploy.md](./docs/full-deploy.md).

## AI Documentation

Project-specific AI notes:

- [AI1 Forecasting](./docs/ai1_forecast.md)
- [AI2 Risk Classification](./docs/ai2_risk.md)
- [AI3 Decision Support](./docs/ai3_decision.md)
- [Requirements](./docs/REQUIREMENTS.md)

## Recommended GitHub Sections To Add Later

To make the repository even stronger before publishing, you can add:

- Demo video or GIF under the banner
- Real field deployment photos in `docs/images/`
- Architecture diagram export from Figma, Excalidraw, or draw.io
- Team section
- License
- Roadmap
- Dataset and model evaluation references

## Status

This project is currently structured as a working research and engineering platform for climate-adaptive aquaculture operations. It is suitable for demos, portfolio presentation, technical review, and continued product development.
