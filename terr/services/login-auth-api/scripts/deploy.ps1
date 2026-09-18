$ErrorActionPreference = "Stop"
$env:SAM_CLI_TELEMETRY = "0"

$stackName = "terraclime-login-auth"
$region = "ap-south-1"
$artifactBucket = "terraclime-data-live-artifacts-717279694116-ap-south-1"
$artifactPrefix = "terraclime-login-auth"
$packagedTemplate = "packaged.yaml"

if ([string]::IsNullOrWhiteSpace($env:JWT_SECRET)) {
  Write-Error "JWT_SECRET environment variable is required before deployment."
}

$parameterOverrides = @(
  'StageName="prod"'
  'AwsRegion="ap-south-1"'
  'UsersTable="UserCredentials"'
  ('JwtSecret="{0}"' -f $env:JWT_SECRET)
  'JwtTtl="2h"'
  'JwtIssuer="terraclime-login-auth-api"'
)

sam build --template-file template.yaml

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

aws cloudformation package `
  --template-file .aws-sam/build/template.yaml `
  --s3-bucket $artifactBucket `
  --s3-prefix $artifactPrefix `
  --output-template-file $packagedTemplate `
  --region $region

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

aws cloudformation deploy `
  --template-file $packagedTemplate `
  --stack-name $stackName `
  --capabilities CAPABILITY_IAM `
  --parameter-overrides $parameterOverrides `
  --region $region `
  --no-fail-on-empty-changeset

exit $LASTEXITCODE
