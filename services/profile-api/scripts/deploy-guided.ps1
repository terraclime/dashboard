$ErrorActionPreference = "Stop"
$env:SAM_CLI_TELEMETRY = "0"

sam deploy --guided --template-file template.yaml

exit $LASTEXITCODE
