$ErrorActionPreference = "Stop"
$env:SAM_CLI_TELEMETRY = "0"

$stackName = "terraclime-dashboard"
$region = if ([string]::IsNullOrWhiteSpace($env:AWS_REGION)) { "ap-south-1" } else { $env:AWS_REGION }
$artifactBucket = if ([string]::IsNullOrWhiteSpace($env:DASHBOARD_ARTIFACT_BUCKET)) { "terraclime-data-live-artifacts-717279694116-ap-south-1" } else { $env:DASHBOARD_ARTIFACT_BUCKET }
$artifactPrefix = if ([string]::IsNullOrWhiteSpace($env:DASHBOARD_ARTIFACT_PREFIX)) { "terraclime-dashboard" } else { $env:DASHBOARD_ARTIFACT_PREFIX }
$packagedTemplate = "packaged.yaml"

$customDomainName = if ([string]::IsNullOrWhiteSpace($env:DASHBOARD_DOMAIN_NAME)) { "overview.terraclime.com" } else { $env:DASHBOARD_DOMAIN_NAME }
$certificateArn = $env:DASHBOARD_CERTIFICATE_ARN

if (-not [string]::IsNullOrWhiteSpace($customDomainName)) {
  if ([string]::IsNullOrWhiteSpace($certificateArn)) {
    Write-Host "Resolving ACM certificate for $customDomainName in $region..."
    $certListJson = aws acm list-certificates --region $region --certificate-statuses ISSUED
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }

    $certificates = @($certListJson | ConvertFrom-Json | Select-Object -ExpandProperty CertificateSummaryList)
    $domainParts = $customDomainName -split "\.", 2
    $wildcardDomain = if ($domainParts.Length -eq 2) { "*.$($domainParts[1])" } else { "" }

    $matchingCertificate = $certificates |
      Where-Object {
        $_.DomainName -eq $customDomainName -or
        $_.SubjectAlternativeNameSummaries -contains $customDomainName -or
        (-not [string]::IsNullOrWhiteSpace($wildcardDomain) -and (
          $_.DomainName -eq $wildcardDomain -or
          $_.SubjectAlternativeNameSummaries -contains $wildcardDomain
        ))
      } |
      Select-Object -First 1

    if ($null -eq $matchingCertificate) {
      Write-Error "No issued ACM certificate found for $customDomainName in $region. Set DASHBOARD_CERTIFICATE_ARN and rerun."
    }

    $certificateArn = $matchingCertificate.CertificateArn
  }
}

$parameterOverrides = @(
  'StageName="prod"'
  'UseDemoData="false"'
  ('AwsRegion="{0}"' -f $region)
  'FlowTable="flow_data"'
  'DeviceTable="device_data"'
  'ApartmentTable="apartment_data"'
  'TariffTable="tariff_configs"'
  ('CustomDomainName="{0}"' -f $customDomainName)
  ('CertificateArn="{0}"' -f $certificateArn)
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
