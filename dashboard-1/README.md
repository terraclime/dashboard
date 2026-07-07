# Terraclime Water Intelligence Dashboard

A simplified demo stack for the Terraclime smart water metering platform. The repo now contains a single React dashboard and a consolidated Node.js API that reads from DynamoDB (or a built-in demo dataset for offline demos).

## Stack Overview

- **Frontend**: React (Create React App) with TailwindCSS for styling and Chart.js for visualisations.
- **Backend**: Express API (`services/api`) with AWS SDK v3. When `USE_DEMO_DATA=true` the API serves curated mock data; disable it to point to live DynamoDB tables.
- **Auth**: Lightweight JWT-based login for demo users (no refresh tokens). Replace with Cognito/IdP for production.
- **Data**: Demo payload mirrors the target DynamoDB schema (users, flow_data, leak events, billing cycles) so the UI contracts stay identical for AWS.

## Quick Start (Demo Mode)

```bash
# install dependencies
cd services/api && npm install
cd ../../client && npm install

# terminal 1 – API in demo mode
cd ../services/api
cp .env.example .env   # optional, defaults already match demo mode
npm run dev

# terminal 2 – React client
cd ../../client
npm start
```

The dashboard will be available at `http://localhost:3000` and will talk to the API on `http://localhost:8080/api`.

## Run with Docker

```bash
docker compose up --build
```

The API is exposed on `http://localhost:8080/api` and the React client is served from `http://localhost:3000`.

## Switching to AWS DynamoDB

1. Create `.env` inside `services/api` based on `.env.example`.
2. Set `USE_DEMO_DATA=false` and provide the relevant table names/region.
3. Ensure the runtime has IAM credentials with read/write permissions to the configured tables (via environment, IAM role, or AWS profile).
4. (Optional) Run `npm run seed` to push the demo admin user/apartment to DynamoDB as a starting point.

## Available API Routes

| Method | Route | Description |
| ------ | ----- | ----------- |
| `POST` | `/api/auth/login` | Authenticate a dashboard user (demo credentials: `demo@terraclime.com` / `Demo@123`). |
| `GET`  | `/api/dashboard/overview` | Summary cards + consumption chart for the current apartment. |
| `GET`  | `/api/reports/overview` | Block-level and flat-level analytics. |
| `GET`  | `/api/reports/flats/:flatId` | Detailed consumption + leak status for a flat. |
| `GET`  | `/api/leaks/summary` | Leak distribution and recent alerts. |
| `GET`  | `/api/billing/summary` | Cycle metrics and projected charges. |
| `GET`  | `/api/profile` | Basic user + apartment profile. |

All analytics routes accept an optional `apartment_id` query parameter; in demo mode the sample community is returned by default.

## Frontend Notes

- Navigation lives in `SideBar` + `NavBar`; responsive widths auto-adjust when the sidebar collapses.
- API calls are centralised in `client/src/api/endpoints.js` so swapping environments only requires updating `REACT_APP_API_BASE_URL`.
- Demo charts and tables update automatically as soon as the API returns data—no hard-coded placeholders remain.
- Styling is intentionally light (soft neutrals with green accents) so the focus stays on data clarity.

## Scripts & Tooling

- `services/api`: `npm run dev` (local server), `npm run seed` (push demo data when not in demo mode), `npm run lint`, `npm test` (node:test smoke checks).
- `client`: `npm start`, `npm run build`, `npm test` (CRA defaults).
- `.gitignore` excludes build artefacts and dependencies across the repo.

## Next Steps

- Replace the demo login with Cognito or another managed IdP.
- Introduce automated integration tests that hit the Express routes using the demo dataset.
- Containerise the API for deployment behind API Gateway + Lambda or ECS.
- Add CI (GitHub Actions) to lint + build both the API and client on every PR.
