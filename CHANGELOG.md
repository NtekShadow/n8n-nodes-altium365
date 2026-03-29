# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] - 2026-03-27

### Fixed
- Grant type corrected to 'pkce' instead of 'authorizationCode' for proper PKCE flow
- Removed unnecessary PKCE configuration properties

## [0.2.1] - 2026-03-27

### Fixed
- PKCE (Proof Key for Code Exchange) with SHA256 challenge method now enabled
- Resolves "code challenge required" error during OAuth2 authorization

## [0.2.0] - 2026-03-27

### BREAKING CHANGES
- **OAuth2 Authentication Required**: Switched from OAuth2 Client Credentials flow to Authorization Code flow
- Users must reconnect their credentials and authenticate via browser
- Nexar requires Authorization Code flow for design.domain scope access

### Changed
- Credentials now extend n8n's oAuth2Api for proper OAuth2 Authorization Code support
- NexarClient refactored to use n8n's requestWithAuthentication helper
- Automatic token refresh handled by n8n's OAuth2 system
- User must authorize application access via Nexar's consent screen

### Added
- OAuth2 redirect URL configuration for proper authentication flow
- Scopes: openid, design.domain, user.access, offline_access

### Fixed
- Authentication now works with Nexar's API requirements
- Resolved "unauthorized_client" error from client credentials flow

### Notes
- Existing credentials from v0.1.x will need to be recreated
- Users must configure redirect URL in Nexar portal to match n8n's OAuth callback
- Unit tests temporarily disabled pending rewrite for OAuth2 flow

## [0.1.5] - 2026-03-27

### Added
- Custom credential test method with detailed logging for troubleshooting authentication issues
- Console logging shows request/response details in n8n logs when testing credentials

## [0.1.4] - 2026-03-27

### Fixed
- Credential test now properly sends URL-encoded form data instead of JSON
- Credentials can now be validated successfully in n8n UI

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
