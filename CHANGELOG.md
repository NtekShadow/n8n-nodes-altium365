# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-03-27

### Fixed
- Missing runtime dependencies `graphql` and `graphql-tag` added to package.json
- Package now loads correctly in n8n installations

## [0.1.2] - 2026-03-19

### Fixed
- GitHub Actions workflow now runs codegen before tests

## [0.1.1] - 2026-03-19

### Changed
- Package name scoped to @jonmash namespace for npm publication
- GitHub Actions workflow configured for automated publishing
- npm trusted publishing (OIDC) implemented for enhanced security
- Provenance attestations enabled for supply chain verification

## [0.1.0] - 2025-03-15

### Added
- Initial release
- Altium 365 Nexar API credentials with OAuth2 client credentials flow
- OAuth token caching with automatic refresh
- GraphQL code generation with full type safety
- Action node with following operations:
  - Projects: Get, Get Many, Get Latest Commit, Get Commit History, Update Parameters
  - Workspaces: Get All
- Trigger node with polling mechanism:
  - Project Committed: Triggers on Git commits with file change details
  - New Project: Triggers when new projects are created
- Comprehensive README with setup instructions
- Full TypeScript support with generated types from Nexar schema
