$ErrorActionPreference = "Stop"
$env:SAM_CLI_TELEMETRY = "0"

sam build --template-file template.yaml

exit $LASTEXITCODE
