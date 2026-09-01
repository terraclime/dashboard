# Microservices

This repo now contains standalone service folders for the remaining APIs that
were still inside the demo monolith.

## Shared runtime

Install the shared runtime dependencies once:

```powershell
cd services/microservice-runtime
npm install
```

The runtime reuses the existing route, controller, service, and demo-data logic
copied from `services/api/src`, so the frontend contract stays unchanged.

## Local ports

- `dashboard-api`: `http://127.0.0.1:8087/api/dashboard/overview`
- `reports-api`: `http://127.0.0.1:8088/api/reports/overview`
- `leaks-api`: `http://127.0.0.1:8089/api/leaks/summary`
- `billing-api`: `http://127.0.0.1:8090/api/billing/summary`
- `bills-api`: `http://127.0.0.1:8091/api/bills/send-bulk`
- `profile-api`: `http://127.0.0.1:8092/api/profile`
- `profile-api` settings data: `http://127.0.0.1:8092/api/profile/settings?user_mail=<user_mail-from-UserCredentials>`
- `prepaid-api`: `http://127.0.0.1:8093/api/prepaid/overview`

## Run locally

From each service directory:

```powershell
npm start
```

Example:

```powershell
cd services/dashboard-api
npm start
```

`billing-api` starts in DynamoDB mode by default. Use `npm run start:demo`
inside `services/billing-api` only when you intentionally want the offline
sample dataset.

`bills-api` is the SMTP/bill-delivery microservice. For a safe local smoke test
against demo residents:

```powershell
cd services/bills-api
npm run start:dry
```

For a dry-run against real DynamoDB records without sending email:

```powershell
cd services/bills-api
npm run start:live-dry
```

Live bill delivery expects these DynamoDB table defaults:

- `APARTMENT_TABLE=apartment_data`
- `USERS_TABLE=UserCredentials`
- `FLOW_TABLE=flow_data`
- `DEVICE_TABLE=device_data`
- `LEAKS_TABLE=leak_data`
- `TARIFF_TABLE=tariff_configs`
- `FINALIZATIONS_TABLE=billing_finalizations`

The old `billing_cycles` table is treated as a legacy optional source only when
`BILLING_TABLE` is explicitly set. Current tariffs are read from
`tariff_configs`, including `blended_rate`.

For real mail delivery, copy `services/bills-api/.env.example` to `.env` and set
`ZEPTO_API_KEY` for ZeptoMail, or set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`,
`SMTP_USER`, and `SMTP_PASS` for a generic SMTP provider such as Zoho Mail. Set
`BILL_TEST_RECIPIENT` while testing if every generated bill should go to one
inbox instead of resident emails.

The React app uses `REACT_APP_BILLS_API_BASE_URL` for deployed bill delivery.
In development it defaults to `http://localhost:8091/api`.

Bill delivery accepts `apartment_id` on individual and bulk send requests. The
service uses it to find flats inside that apartment, then sends to
`resident_email` from apartment flat metadata or `user_mail` from
`UserCredentials` when the flat metadata has no email.

The bill email takes its payment destination and inlet layout from the
apartment data. Store the RWA payment fields on the apartment (or its tariff
record) as `rwa_name`, `rwa_account_name`, `rwa_bank`, `rwa_account_number`,
and `rwa_ifsc`. A nested `rwa_bank_account` object with `bank`, `account_name`,
`account_number`, and `ifsc` is also supported. Each flat's `devices` array
should include `device_id`, `inlet` (the location shown in the bill), and
`status`; equivalent rows in `device_data` are also supported. The current-cycle
table then creates one column per configured inlet.

To send directly by email for the current billing cycle:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8091/api/bills/send-email" `
  -ContentType "application/json" `
  -Body '{"email":"resident1@example.com","apartment_id":"SOBHA-TWR-1"}'
```

`cycleId` is optional for this endpoint. When omitted, the service uses the
apartment's configured current billing cycle.

Tenant final billing uses an inclusive calendar-date cutoff. Preview the
authoritative amount with `GET /api/bills/finalization-preview/:flatId`, then
persist and send it with `POST /api/bills/finalize/:flatId`. Both calls require
`apartment_id`, `cycleId`, and `cutoff_date` (`YYYY-MM-DD`). A finalization is
immutable and idempotent; if delivery fails, retry the saved snapshot with
`POST /api/bills/finalizations/:finalizationId/retry-email`.

## Build and deploy

Each service folder includes its own SAM template:

```powershell
cd services/reports-api
npm run sam:build
npm run sam:deploy
```

The Lambda code package for these services is `services/microservice-runtime/`.
Each service template points at its own handler inside that shared runtime.
