# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
