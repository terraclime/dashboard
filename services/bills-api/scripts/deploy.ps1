$ErrorActionPreference = "Stop"
$env:SAM_CLI_TELEMETRY = "0"

function Import-DotEnv {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return
  }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
      return
    }

    $separator = $line.IndexOf("=")
    if ($separator -lt 1) {
      return
    }

    $name = $line.Substring(0, $separator).Trim()
    $value = $line.Substring($separator + 1).Trim()
    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

Import-DotEnv ".env"

$stackName = "terraclime-bills-api"
$region = if ([string]::IsNullOrWhiteSpace($env:AWS_REGION)) { "ap-south-1" } else { $env:AWS_REGION }
$artifactBucket = if ([string]::IsNullOrWhiteSpace($env:BILLS_API_ARTIFACT_BUCKET)) { "terraclime-data-live-artifacts-717279694116-ap-south-1" } else { $env:BILLS_API_ARTIFACT_BUCKET }
$artifactPrefix = if ([string]::IsNullOrWhiteSpace($env:BILLS_API_ARTIFACT_PREFIX)) { "terraclime-bills-api" } else { $env:BILLS_API_ARTIFACT_PREFIX }
$packagedTemplate = "packaged.yaml"
$apartmentTimeZone = if ([string]::IsNullOrWhiteSpace($env:APARTMENT_TIME_ZONE)) { "Asia/Kolkata" } else { $env:APARTMENT_TIME_ZONE }

$customDomainName = if ([string]::IsNullOrWhiteSpace($env:BILLS_API_DOMAIN_NAME)) { "bills-api.terraclime.com" } else { $env:BILLS_API_DOMAIN_NAME }
$certificateArn = $env:BILLS_API_CERTIFICATE_ARN

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
      Write-Error "No issued ACM certificate found for $customDomainName in $region. Set BILLS_API_CERTIFICATE_ARN and rerun."
    }

    $certificateArn = $matchingCertificate.CertificateArn
  }
}

$parameterOverrides = @(
  'StageName="prod"'
  'UseDemoData="false"'
  ('ZeptoApiKey="{0}"' -f $env:ZEPTO_API_KEY)
  ('SmtpHost="{0}"' -f $env:SMTP_HOST)
  ('SmtpPort="{0}"' -f $env:SMTP_PORT)
  ('SmtpSecure="{0}"' -f $env:SMTP_SECURE)
  ('SmtpUser="{0}"' -f $env:SMTP_USER)
  ('SmtpPass="{0}"' -f $env:SMTP_PASS)
  ('SmtpFrom="{0}"' -f $env:SMTP_FROM)
  ('BillTestRecipient="{0}"' -f $env:BILL_TEST_RECIPIENT)
  ('MailDryRun="{0}"' -f $(if ([string]::IsNullOrWhiteSpace($env:MAIL_DRY_RUN)) { "false" } else { $env:MAIL_DRY_RUN }))
  ('AwsRegion="{0}"' -f $region)
  'UsersTable="UserCredentials"'
  'FlowTable="flow_data"'
  'DeviceTable="device_data"'
  'ApartmentTable="apartment_data"'
  'TariffTable="tariff_configs"'
  'LeaksTable="leak_data"'
  'FinalizationsTable="billing_finalizations"'
  ('ApartmentTimeZone="{0}"' -f $apartmentTimeZone)
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
