# login-auth-api

Standalone SAM/Lambda microservice for `POST /api/auth/login`.

## Local run

Without Docker:

```powershell
npm start
```

With SAM and Docker:

```powershell
npm run start:sam
```

## Deploy to AWS Lambda

This service deploys as a Lambda + API Gateway stack named `terraclime-login-auth`.

1. Configure AWS credentials for the target account.
2. Set a real JWT signing secret in your shell.
3. Run the deploy script.

```powershell
$env:AWS_REGION="ap-south-1"
$env:JWT_SECRET="replace-with-a-long-random-secret"
npm run deploy
```

The deploy script:

- runs `sam build`
- deploys with stack name `terraclime-login-auth`
- uses DynamoDB table `UserCredentials`
- creates `POST /api/auth/login` in API Gateway

To verify AWS credentials before deploying:

```powershell
aws sts get-caller-identity
```

If you prefer the interactive SAM flow instead of the scripted deploy:

```powershell
npm run sam:deploy
```

## Generate bcrypt hash

```powershell
npm run hash-password -- "Qwerty123459@"
```

Optional salt rounds:

```powershell
npm run hash-password -- "Qwerty123459@" 10
```

Store the output in DynamoDB as `hash_password`. Do not store the plaintext password.

## Add or update a DynamoDB user

The login service reads from `UserCredentials` using `user_mail` as the key.
This command hashes the password locally and writes the item to DynamoDB:

```powershell
$env:USER_PASSWORD="<plain-password>"
npm run upsert-user -- --user-name="Hari" --user-mail="hari@terraclime.com" --apartment-name="SOBHA APARTMENTS" --apartment-id="SOBCH1TER" --status="Active" --role="102"
Remove-Item Env:\USER_PASSWORD
```

The item fields written are `user_mail`, `user_name`, `apartment_name`,
`apartment_id`, `hash_password`, `user_status`, `role`, and `account_type`.
Set `--status="Inactive"` to prevent the user from logging in.

## Request

```json
{
  "user_mail": "hari@terraclime.com",
  "user_password": "Qwerty123459@"
}
```

## Response

```json
{
  "accessToken": "<jwt>",
  "role": "user",
  "account_type": "standard",
  "apartment": {
    "id": "SOBCH1TER",
    "name": "SOBHA APARTMENTS"
  },
  "user": {
    "mail": "hari@terraclime.com",
    "first_name": "",
    "last_name": ""
  }
}
```

## Environment

- `AWS_REGION`
- `USERS_TABLE`
- `JWT_SECRET`
- `JWT_TTL`
- `JWT_ISSUER`

The service authenticates against the DynamoDB `hash_password` field. The plaintext `password` field should not be used by callers.
