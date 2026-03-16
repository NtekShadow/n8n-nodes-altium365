# Project Context: n8n-nodes-altium365

## Project Overview

This is an n8n community node package that integrates Altium 365 with n8n workflows via the Nexar GraphQL API. The package provides both action nodes and trigger nodes for comprehensive workflow automation with Altium 365.

**Current Version:** 0.1.0 (tagged in git as v0.1.0)

**Package Name:** n8n-nodes-altium365

**Repository:** https://github.com/jonmash/n8n-nodes-altium365

## Current Status

### ✅ Completed (v0.1.0)

**Core Infrastructure:**
- OAuth2 client credentials flow with automatic token caching
- Token refresh logic (24-hour tokens, refreshes 5 minutes before expiry)
- GraphQL Code Generator integration for full type safety from Nexar schema
- NexarClient class handles all API communication
- TypeScript build pipeline with ESLint and Prettier
- Clean git history with professional commit messages

**Implemented Nodes:**

1. **Altium365 (Action Node)**
   - Projects resource:
     - Get (by ID)
     - Get Many (paginated)
     - Get Latest Commit
     - Get Commit History
     - Update Parameters (stub - not yet implemented)
   - Workspaces resource:
     - Get All

2. **Altium365Trigger (Trigger Node)**
   - Project Committed: Monitors for Git commits, outputs commit details and file changes
   - New Project: Monitors for new projects created in workspace

**Documentation:**
- Comprehensive README with setup instructions
- CHANGELOG.md
- MIT License
- Usage examples

## Architecture

### GraphQL Code Generation Pattern

The project uses `@graphql-codegen/cli` to generate fully typed TypeScript SDK from the Nexar GraphQL schema:

1. Write GraphQL queries in `shared/queries/**/*.graphql`
2. Run `npm run codegen` to:
   - Introspect the Nexar schema (https://api.nexar.com/graphql)
   - Validate queries against schema
   - Generate TypeScript types and SDK functions in `shared/generated/graphql.ts`
3. Import and use the typed SDK via `NexarClient.getSdk()`

**Important:** Generated files in `shared/generated/` are NOT committed to git (in .gitignore) and must be regenerated after fresh clone.

### NexarClient Pattern

All API communication goes through `shared/NexarClient.ts`:

```typescript
const client = new NexarClient(clientId, clientSecret);
const sdk = await client.getSdk();
const result = await sdk.GetProjectById({ id: projectId });
```

The client automatically:
- Fetches OAuth tokens
- Caches tokens until 5 minutes before expiry
- Refreshes tokens when needed
- Sets proper User-Agent header
- Handles GraphQL errors

### Trigger Node Pattern

Trigger nodes use the `poll()` method with n8n's polling mechanism. Helper methods require special TypeScript handling:

```typescript
// In poll() method
if (event === 'projectCommitted') {
    return await Altium365Trigger.prototype.pollProjectCommitted.call(
        this,
        client,
        workspaceUrl,
        workflowStaticData,
    );
}

// Helper method signature
private async pollProjectCommitted(
    this: IPollFunctions,
    client: NexarClient,
    workspaceUrl: string,
    staticData: WorkflowStaticData,
): Promise<INodeExecutionData[][] | null> {
    // Implementation
}
```

**Key points:**
- Must use `.prototype.method.call(this, ...)` to call helper methods
- First parameter of helper must be `this: IPollFunctions`
- This allows TypeScript to properly type-check the context

### State Storage in Triggers

Triggers store state in `workflowStaticData`:

```typescript
interface WorkflowStaticData {
    lastRevisions?: Record<string, string>; // projectId -> revisionId
    lastProjectIds?: string[];
}

const staticData = this.getWorkflowStaticData('node') as WorkflowStaticData;
```

On first run, initialize storage. On subsequent runs, compare current state to detect changes.

## Important Files

```
├── credentials/
│   └── Altium365NexarApi.credentials.ts  # OAuth2 credentials definition
├── nodes/
│   ├── Altium365/
│   │   ├── Altium365.node.ts             # Main action node
│   │   ├── Altium365.node.json           # Codex metadata
│   │   └── altiumn8n.svg                 # Node icon (project logo)
│   └── Altium365Trigger/
│       ├── Altium365Trigger.node.ts      # Polling trigger node
│       ├── Altium365Trigger.node.json    # Codex metadata
│       └── altium365trigger.svg          # Trigger icon
├── shared/
│   ├── NexarClient.ts                    # GraphQL client with OAuth
│   ├── queries/
│   │   ├── workspace.graphql             # Workspace queries
│   │   └── projects.graphql              # Project & commit queries
│   └── generated/
│       └── graphql.ts                    # Auto-generated (443KB)
├── assets/
│   ├── artwork.svg                       # Logo source artwork
│   └── altiumn8n.svg                     # Project logo
├── package.json
├── tsconfig.json
├── codegen.yml                           # GraphQL code generator config
├── eslint.config.mjs
├── gulpfile.js                           # Icon copy task
├── README.md
├── CHANGELOG.md
└── LICENSE.md
```

## Development Commands

```bash
# Install dependencies
npm install

# Generate GraphQL types from Nexar schema
npm run codegen

# Build the project (runs codegen + tsc + gulp)
npm run build

# Watch mode (TypeScript only)
npm run dev

# Lint code
npm run lint

# Fix linting issues
npm run lintfix

# Format code
npm run format
```

## Key Implementation Details

### Token Caching Logic

Located in `shared/NexarClient.ts`:

```typescript
// Token expires_in is in seconds (typically 86400 = 24 hours)
// We refresh 5 minutes before expiry to prevent race conditions
const expiresAt = now + tokenData.expires_in * 1000 - TOKEN_REFRESH_BUFFER_MS;
```

The 5-minute buffer ensures we never use an expired token.

### Commit Detection

The "Project Committed" trigger works by:
1. Polling `desProjectById(id).latestRevision.revisionId` for each project
2. Comparing to last known revision ID stored in workflow static data
3. When different, fetching full commit details and outputting event
4. Storing new revision ID for next poll

**Important:** `latestRevision` can be `null` if project uses Simple Sync or external VCS.

### Error Handling

All operations wrap errors and convert to n8n's `NodeOperationError`:

```typescript
try {
    // Operation
} catch (error) {
    if (this.continueOnFail()) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        returnData.push({ json: { error: errorMessage }, pairedItem: { item: i } });
        continue;
    }
    throw error;
}
```

## Known Limitations / TODOs

### Not Yet Implemented

1. **BOM Operations** - Get WIP BOM, Get Release BOM
2. **Releases** - Get all releases, Get release by ID
3. **Library** - Component operations
4. **Comments** - Create, update, delete (queries exist but mutations not exposed)
5. **Tasks** - Full CRUD operations
6. **Exports** - Async export job pattern with polling
7. **Update Project Parameters** - Placeholder exists but needs implementation
8. **Pagination Handling** - Currently limits to first 100 items for workspace-wide triggers

### Future Enhancements

1. Add more trigger events:
   - New Release
   - New Comment
   - New Task
2. Implement GraphQL subscription for real-time comment notifications
3. Add file download operations (design files, exports)
4. Add collaboration revision tracking
5. Implement async export job polling pattern
6. Set up pre-commit hook to run linting automatically (husky + lint-staged)

### ESLint Note

The `eslint-plugin-n8n-nodes-base` is incompatible with ESLint 10, so we removed it from the config. The plugin's rules are helpful but not critical. Consider downgrading to ESLint 9 if those rules are needed.

## API Documentation

- **Nexar API:** https://nexar.com/api
- **Nexar Portal:** https://portal.nexar.com/ (create apps and get credentials)
- **GraphQL Endpoint:** https://api.nexar.com/graphql
- **Token Endpoint:** https://identity.nexar.com/connect/token
- **Scope Required:** `design.domain`

## Nexar Schema Notes

### Critical Fields for Commit Tracking

```graphql
type DesProject {
    updatedAt: DateTime!         # Updates on every Git push
    latestRevision: DesVcsRevision  # Latest Git commit (NULLABLE!)
    revisions: DesVcsRevisionConnection  # Full commit history
}

type DesVcsRevision {
    revisionId: String!          # Git commit hash
    message: String!             # Commit message
    author: String!              # Author name (not DesUser object!)
    createdAt: DateTime!         # Commit timestamp
    files: [DesVcsRevisionFileChange!]!
}

type DesVcsRevisionFileChange {
    kind: DesVcsChangeKind!      # ADDED | DELETED | MODIFIED | NONE
    path: String!                # File path
}
```

**Important:** The `latestRevision` and `revisions` fields are **NULLABLE**. Projects using Simple Sync or external VCS will have `null` values. Always null-check before accessing.

## Testing

To test locally before publishing:

1. Build the package: `npm run build`
2. Link locally: `npm link`
3. In your n8n installation: `npm link n8n-nodes-altium365`
4. Restart n8n
5. The nodes should appear in the n8n UI

## Publishing to npm

When ready to publish:

1. Ensure package.json has correct author email and repository URL
2. Run `npm run build` to ensure clean build
3. Run `npm run lint` to verify no errors
4. Update CHANGELOG.md with new version
5. Commit changes
6. Create git tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
7. Run `npm publish`
8. Push commits and tags: `git push && git push --tags`

## Dependencies

**Runtime:**
- `graphql-request` ^7.4.0 - GraphQL client

**Development:**
- `@graphql-codegen/*` - Code generation from GraphQL schema
- `typescript` ^5.6.2
- `n8n-workflow` ^1.120.0 - Peer dependency for types
- ESLint, Prettier, Gulp

## Commit Message Style

Following professional git conventions:
- Keep messages short and brief (one line preferred)
- Use passive voice
- Professional tone
- No mention of tools or automation
- Focus on what was changed, not who or how

Example: "GraphQL codegen configured and workspace query added"

## Next Session Checklist

When resuming work:

1. Run `npm install` if fresh clone
2. Run `npm run codegen` to regenerate GraphQL types
3. Run `npm run build` to verify everything compiles
4. Check `git log --oneline` to see where we left off
5. Review TODOs in this file for next features to implement

## Questions to Address

- Should we implement full pagination for "Get All" operations?
- Which additional resources are highest priority? (BOM, Releases, Library)
- Do we need the GraphQL subscription for comments, or is polling sufficient?
- Should we add more filtering options to "Get Many Projects"?

## Useful GraphQL Queries for Testing

Test credentials:
```graphql
query TestCredentials {
  desWorkspaceInfos {
    url
    name
  }
}
```

Get project with commits:
```graphql
query GetProjectWithCommits($id: ID!) {
  desProjectById(id: $id) {
    name
    latestRevision {
      revisionId
      message
      author
    }
  }
}
```

---

**Last Updated:** 2025-03-16
**Current Branch:** master
**Current Tag:** v0.1.0
