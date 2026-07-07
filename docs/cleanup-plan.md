# Cleanup & Restructure Plan

## Goals
- Remove legacy artefacts and binaries so the repo only contains source code.
- Collapse the backend into a single AWS-aligned service workspace.
- Standardise configuration, dependency management, and developer workflows.

## Tasks
- [x] Delete the legacy `server/` Express app and associated SQL files once the new AWS service is in place.
- [x] Remove committed build outputs (`client/build`, `server/build`) and `node_modules/` directories, then rely on `.gitignore`.
- [x] Move active microservice code from `terraclime-server-microservices/` into a consolidated `services/api` package with shared utilities.
- [x] Add repository-wide linting/formatting (ESLint + Prettier) and npm scripts for install/test/build.
- [x] Create shared AWS configuration helpers (DynamoDB client, mock seed loader) under `services/shared/`.
- [x] Define `.env.example` with all required environment variables; ensure secrets are not committed.

## Deliverables
- Clean tree (source + configuration only).
- One backend entry point ready for AWS Lambda or container deployment.
- Documented setup instructions for loading demo data and running the stack.

## Timeline
1. Cleanup + structure (current step).
2. Backend consolidation & dummy-data loaders.
3. Frontend integration pass.
4. Testing + documentation polish.
