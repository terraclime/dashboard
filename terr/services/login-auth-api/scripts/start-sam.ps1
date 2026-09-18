$ErrorActionPreference = "Stop"
$env:SAM_CLI_TELEMETRY = "0"

sam local start-api --port 3000

exit $LASTEXITCODE
