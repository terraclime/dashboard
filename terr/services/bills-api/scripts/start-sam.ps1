$ErrorActionPreference = "Stop"
$env:SAM_CLI_TELEMETRY = "0"

sam local start-api --template-file template.yaml

exit $LASTEXITCODE
