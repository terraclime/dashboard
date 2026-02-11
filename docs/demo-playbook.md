# Demo Playbook

Steps to walk through the dashboard with the bundled demo data.

## 1. Log in
- Navigate to `http://localhost:3000`.
- Use the credentials `demo@terraclime.com` / `Demo@123`.
- On successful login the dashboard route loads and local storage is seeded with the access token and apartment context.

## 2. Dashboard overview
- Confirm the summary cards show totals (devices, active devices, litres consumed).
- Check the 7-day consumption chart and the donut chart for device health.

## 3. Reports
- Browse to **Reports** from the sidebar.
- Inspect the consumption by block (bar chart) and device activity (donut chart).
- Scroll down to the flat table; choose a flat and open its detail view.

## 4. Individual flat detail
- Verify the daily consumption line chart is populated.
- Review the leak event timeline and the device health table.

## 5. Leak insights
- From the sidebar open **Leaks**.
- The summary cards, leak distribution donut, and leak timeline should render.
- Inspect the recent leak alerts list.

## 6. Billing
- Open **Billing** to view the current cycle, per-flat projections, and finance notes.

## 7. Settings
- Check that the profile card shows the logged-in user and apartment metadata.

> Tip: The API exposes `GET /api/healthz` for quick smoke checks. Run `curl http://localhost:8080/api/healthz` before the demo to ensure the backend is live.
