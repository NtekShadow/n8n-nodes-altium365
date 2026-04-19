# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.9] - 2026-04-19

### Changed
- Bumped package version to 1.3.9 for release

## [1.3.8] - 2026-04-19

### Changed
- Improved tool description for Altium365 node to make operation usage clearer for AI agents
- Removed resource prefixes from operation names in description bullets for idiot-proof clarity

## [0.3.3] - 2026-03-29

### Changed
- Added "API Endpoint URL" field to credentials for manual configuration
- Users must now enter their workspace-specific API endpoint (e.g., https://uw.api.nexar.com/graphql)
- Removed automatic API endpoint discovery to avoid chicken-and-egg OAuth issues
- Nodes now use the manually configured endpoint directly

### Breaking Changes
- Existing credentials will need to be recreated and must include the API Endpoint URL
- To find your API endpoint: run the Python example or check workspace location

## [0.3.2] - 2026-03-29

### Fixed
- Added `audience=https://api.nexar.com` parameter to OAuth authorization request
- Attempting to get proper audience claim in JWT tokens

## [0.3.1] - 2026-03-29

### Fixed
- **Critical**: Now uses workspace-specific API endpoints (e.g., uw.api.nexar.com) instead of hardcoded api.nexar.com
- Queries desWorkspaceInfos to get correct regional API endpoint for each workspace
- Fixes "Token validation failed" errors caused by audience claim mismatch
- Each workspace's token is validated against its specific regional API endpoint

### Changed
- NexarClient now accepts optional apiUrl parameter
- Added static getWorkspaceApiUrl() method to resolve workspace-specific endpoints
- Action and trigger nodes now dynamically discover correct API URL before operations

## [0.3.0] - 2026-03-29

### Fixed
- Added missing `profile` and `email` scopes to OAuth2 request to match Nexar requirements
- Scopes now match official Nexar example implementation
- Should resolve missing audience claim in JWT tokens

### Breaking Changes
- Existing credentials will need to be recreated to use new scopes

## [0.2.12] - 2026-03-29

### Changed
- Enhanced JWT logging to show complete token payload for comprehensive debugging
- Shows all token claims including audience, expiry, and any custom fields

## [0.2.11] - 2026-03-29

### Changed
- Added JWT token decoding to inspect claims (audience, issuer, client_id, subject)
- Enhanced debugging to verify token claims match Nexar API expectations

## [0.2.10] - 2026-03-29

### Changed
- Added detailed token inspection logging showing granted scopes and token format
- Logs now display token type, scope, expiry, and token length for debugging
- Enhanced visibility into actual OAuth token contents

## [0.2.9] - 2026-03-29

### Changed
- Added credential data inspection logging to verify OAuth token storage
- Logs now show if access_token and refresh_token are present in credentials
- Enhanced debugging for OAuth2 authentication flow issues

## [0.2.8] - 2026-03-29

### Changed
- Enhanced error logging in NexarClient to capture full error details from OAuth2 requests
- Added logging for error response body, status code, and full error object structure
- Improved debugging capabilities for authentication issues

## [0.2.7] - 2026-03-27

### Fixed
- Re-added `offline_access` scope to enable refresh token functionality
- Added `access_type=offline&prompt=consent` query parameters for refresh token request
- Resolves "refreshToken is required" error when n8n tries to refresh expired tokens

## [0.2.6] - 2026-03-27

### Fixed
- Adjusted OAuth2 scopes to exactly match Nexar documentation: `openid design.domain user.access`
- Removed `offline_access` scope which may not be supported by Nexar
- Removed `access_type=offline` auth query parameter
- Added request/response header logging for debugging OAuth token issues

## [0.2.5] - 2026-03-27

### Fixed
- Changed from `requestWithAuthentication` to `requestOAuth2` helper for proper OAuth2 credential handling
- Resolves "Authorization failed" error when polling triggers try to access OAuth2 credentials
- Added tokenType: 'Bearer' configuration for OAuth2 requests

## [0.2.4] - 2026-03-27

### Changed
- Enhanced error logging in NexarClient to show actual errors from requestWithAuthentication
- Added debug logging to track GraphQL requests and credential usage
- Errors now propagate properly instead of being wrapped in generic 502 responses

## [0.2.3] - 2026-03-27

### Fixed
- Improved error handling in custom fetch function to properly catch and report API errors
- Added returnFullResponse to get proper HTTP status codes from API responses
- Fixed "Bad gateway" errors by properly handling requestWithAuthentication errors

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
