# reports-api

Standalone SAM/Lambda microservice for reports endpoints:

- `GET /api/reports/overview`
- `GET /api/reports/flats/{flatId}`

## Local run

Without Docker:

```powershell
npm start
```

With SAM and Docker:

```powershell
npm run start:sam
```

## Deploy to AWS Lambda with HTTPS

This service deploys as a Lambda + API Gateway stack named `terraclime-reports`.
By default the scripted deploy configures the custom HTTPS domain
`reports.terraclime.com`.

1. Configure AWS credentials for the target account.
2. Ensure an issued ACM certificate exists in `ap-south-1` for either
   `reports.terraclime.com` or `*.terraclime.com`.
3. Run the deploy script.

```powershell
$env:AWS_REGION="ap-south-1"
npm run deploy
```

The deploy script:

- runs `sam build`
- packages artifacts to `terraclime-data-live-artifacts-717279694116-ap-south-1`
- deploys with stack name `terraclime-reports`
- uses live DynamoDB tables
- resolves the ACM certificate automatically
- creates `https://reports.terraclime.com/api/reports/*`

Overrides:

```powershell
$env:REPORTS_DOMAIN_NAME="reports.terraclime.com"
$env:REPORTS_CERTIFICATE_ARN="<certificate-arn>"
$env:REPORTS_ARTIFACT_BUCKET="<artifact-bucket>"
$env:REPORTS_ARTIFACT_PREFIX="terraclime-reports"
```

DNS for `terraclime.com` is managed outside this AWS account. After deployment,
point `reports.terraclime.com` to the API Gateway regional domain shown by:

```powershell
aws apigateway get-domain-name --domain-name reports.terraclime.com --region ap-south-1
```

To verify AWS credentials before deploying:

```powershell
aws sts get-caller-identity
```

If you prefer the interactive SAM flow instead of the scripted deploy:

```powershell
npm run sam:deploy
```

## Environment

- `AWS_REGION`
- `USE_DEMO_DATA`
- `USERS_TABLE`
- `FLOW_TABLE`
- `DEVICE_TABLE`
- `APARTMENT_TABLE`
- `BILLING_TABLE`
- `LEAKS_TABLE`
