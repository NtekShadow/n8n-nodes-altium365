# Project Context: n8n-nodes-altium365

## Project Overview

This is an n8n community node package that integrates Altium 365 with n8n workflows via the Nexar GraphQL API. The package provides both action nodes and trigger nodes for comprehensive workflow automation with Altium 365.

**Current Version:** 1.3.2 (tagged in git as v1.3.2)

**Package Name:** @ntek/n8n-nodes-altium365

**Repository:** https://github.com/NtekShadow/n8n-nodes-altium365

## Current Status

### ✅ Implemented

**Core Infrastructure:**
- OAuth2 PKCE credential flow via n8n's `httpRequestWithAuthentication` (handles token injection and refresh automatically)
- GraphQL Code Generator integration for full type safety from Nexar schema
- `NexarClient` class routes all API calls through n8n's auth helper
- Partial GraphQL error handling: when Nexar returns both `data` and `errors`, errors are logged as warnings and execution continues
- TypeScript build pipeline with ESLint, Prettier, Husky, lint-staged
- Docker DNS fix: set `dns: [1.1.1.1, 1.0.0.1]` in docker-compose to avoid 4s resolution latency

**Altium365 (Action Node):**
- **Project resource:**
  - Get (by ID)
  - Get Many (paginated, with return-all option)
  - Get Latest Commit
  - Get Commit History (paginated)
  - Update Parameters (fixedCollection UI, replaceExisting flag)
- **Workspace resource:**
  - Get All
- **Export resource:**
  - Download Release Package (returns variant download URLs)
  - Export Project Files (Gerber, GerberX2, IDF, NCDrill, CustomOutJob — async poll loop)
  - Create Manufacture Package (async poll loop, supports webhook callback URL for async mode)

**Altium365Trigger (Trigger Node):**
- **Project Committed:** Monitors Git commits across all or a single project. Incremental polling with `updatedAt >= lastPollTime` filter. Detects both new commits and metadata changes. Outputs commit details and file changes.
- **New Project:** Detects new projects created in workspace since last poll.
- **Component Updated:** Detects created/modified library components. Full fetch required (no server-side date filter available on library). Tracks state as `modifiedAt|revisionId`.
- Poll throttle: configurable minimum interval (1/5/10/15/30/60 min) with 5-second jitter buffer to prevent skipped polls.

**UX / Dropdowns:**
- `projectId` in both nodes uses `resourceLocator` type with server-side paginated search (50 per page) and a "By ID" manual entry mode.
- `releaseId` uses `loadOptions` cascading off `projectId`.
- `variantName` uses `loadOptions` (from `DesProject.design.variants`) with a `(Default Variant)` blank entry.
- `revisionId` uses `loadOptions` (last 50 commits) with a `(Latest Version)` blank entry, displaying `shortHash - message (date)`.
- Trigger `projectId` list includes `(All Projects)` as first entry (value `''` = monitor all).

---

## Architecture

### GraphQL Code Generation

Queries live in `shared/queries/**/*.graphql`. The codegen reads `nexar.sdl` (the full Nexar schema SDL, checked into the repo) and generates `shared/generated/graphql.ts`.

**Important:** `shared/generated/graphql.ts` is NOT committed (in `.gitignore`). Run `npm run codegen` after a fresh clone. The codegen reads from `nexar.sdl` locally — no network call required.

```bash
npm run codegen   # regenerate types from nexar.sdl
npm run build     # codegen + tsc + gulp (copy icons)
```

### NexarClient Pattern

All API calls go through `shared/NexarClient.ts`. It wraps `graphql-request` and delegates HTTP to n8n's `httpRequestWithAuthentication`, which injects the Bearer token and handles refresh on 401.

```typescript
const client = new NexarClient(this, 'altium365NexarApi', apiUrl);
const sdk = client.getSdk();
const result = await sdk.GetProjectById({ id: projectId });
```

The `ExecutionContext` union type covers `IExecuteFunctions | IPollFunctions | ILoadOptionsFunctions` — the same client works in action nodes, trigger polls, and dropdown loaders.

### Dynamic Dropdowns

Two patterns are used:

**`resourceLocator` (for projectId)** — supports server-side search with pagination:
```typescript
methods = {
  listSearch: {
    async searchProjects(this: ILoadOptionsFunctions, filter?, paginationToken?): Promise<INodeListSearchResult>
  }
}
```
Read the value with `{ extractValue: true }`:
```typescript
// In IExecuteFunctions:
const projectId = this.getNodeParameter('projectId', i, '', { extractValue: true }) as string;
// In IPollFunctions or loadOptions:
const projectId = this.getNodeParameter('projectId', '', { extractValue: true }) as string;
// In getCurrentNodeParameter (loadOptions cascade):
const projectId = this.getCurrentNodeParameter('projectId', { extractValue: true }) as string;
```

**`loadOptions` (for release/variant/revision)** — loads full list, client-side only:
```typescript
methods = {
  loadOptions: {
    async getReleases(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]>
  }
}
```
Use `loadOptionsDependsOn: ['projectId']` to cascade off the project selector.

### Trigger Node Pattern

Helper methods require explicit prototype binding to preserve TypeScript context typing:

```typescript
// In poll():
return await Altium365Trigger.prototype.pollProjectCommitted.call(this, client, workspaceUrl, staticData);

// Helper signature:
private async pollProjectCommitted(
    this: IPollFunctions,
    client: NexarClient,
    workspaceUrl: string,
    staticData: WorkflowStaticData,
): Promise<INodeExecutionData[][] | null>
```

### State Storage in Triggers

```typescript
interface WorkflowStaticData {
    lastRevisions?: Record<string, string>;   // projectId -> revisionId
    lastPollTime?: string;                    // ISO timestamp
    lastProjectIds?: string[];
    lastComponentState?: Record<string, string>; // componentId -> "modifiedAt|revisionId"
}
const staticData = this.getWorkflowStaticData('node') as WorkflowStaticData;
```

First run establishes baseline (no events fired). Subsequent runs compare against stored state.

**Note:** "Listen for test event" in n8n does NOT persist static data. Only activated (running) workflows persist state correctly.

### Async Export Jobs

Export operations use a poll loop:
```typescript
await pollJob(
    () => sdk.GetProjectExportJob({ projectExportJobId: jobId }),
    (r) => r.desProjectExportJob?.status === 'DONE',
    (r) => r.desProjectExportJob?.status === 'ERROR',
    (r) => `Export job failed: ${r.desProjectExportJob?.reason}`,
    pollIntervalMs,
    timeoutMs,
);
```

The `CreateManufacturePackage` operation also accepts an optional `callbackUrl`. When set, the node skips the poll loop and returns `{jobId, status: 'PENDING'}` immediately. Nexar POSTs to the callback URL when the package is ready and shared. Use an n8n Webhook Trigger node URL here.

---

## Important Files

```
├── credentials/
│   └── Altium365NexarApi.credentials.ts     # OAuth2 PKCE credential
├── nodes/
│   ├── Altium365/
│   │   ├── Altium365.node.ts                # Action node
│   │   ├── Altium365.node.json              # Codex metadata
│   │   └── altium365.svg                    # Node icon
│   └── Altium365Trigger/
│       ├── Altium365Trigger.node.ts         # Polling trigger node
│       ├── Altium365Trigger.node.json       # Codex metadata
│       └── altium365trigger.svg             # Trigger icon
├── shared/
│   ├── NexarClient.ts                       # GraphQL client with n8n auth
│   ├── log.ts                               # Timestamped logging helpers
│   ├── queries/
│   │   ├── workspace.graphql
│   │   ├── projects.graphql                 # Projects, commits, variants, components
│   │   └── exports.graphql                  # Releases, export jobs, manufacture packages
│   └── generated/
│       └── graphql.ts                       # Auto-generated — do not edit
├── nexar.sdl                                # Full Nexar GraphQL schema SDL
├── codegen.yml                              # Codegen config (reads nexar.sdl)
├── package.json
├── tsconfig.json
├── eslint.config.mjs
├── gulpfile.js
└── view-n8n-logs.sh                         # Tail n8n Docker logs filtered to Altium
```

---

## Development Commands

```bash
npm install          # install dependencies
npm run codegen      # regenerate GraphQL types from nexar.sdl
npm run build        # codegen + tsc + copy icons
npm run dev          # tsc --watch (TypeScript only)
npm run lint         # eslint
npm run lintfix      # eslint --fix
npm run format       # prettier
```

---

## Release Process

**CRITICAL:** npm publish is triggered by pushing a git tag. Merging to master alone does NOT publish. Always tag after merging.

1. Bump version in `package.json`
2. Commit and merge to master via feature branch (squash merge)
3. Tag and push immediately after merge:
   ```bash
   git tag -a v0.X.0 -m "v0.X.0"
   git push --tags
   ```
4. GitHub Actions publishes to npm via OIDC trusted publishing (no token needed)

Monitor: https://github.com/NtekShadow/n8n-nodes-altium365/actions

---

## Nexar API Notes

- **GraphQL endpoint:** `https://api.nexar.com/graphql`
- **Token endpoint:** `https://identity.nexar.com/connect/token`
- **Scope required:** `design.domain`
- **Portal (create apps):** https://portal.nexar.com/

### Key Schema Facts

- `latestRevision` and `revisions` on `DesProject` are **nullable** — projects using Simple Sync or external VCS return `null`. Always null-check.
- `DesVcsRevision.author` is a plain `String`, not a `DesUser` object.
- Library `updatedAt` on `desLibrary` is stale (returns 2018) and never updates — do not use as a gate for component polling.
- `callbackUrl` is only available on `DesCreateManufacturePackageInput`, not on `DesCreateProjectExportJobInput`.
- Design variants (for `variantName`) live on `DesProject.design.variants[]` (WIP, not release-specific).

### Pending: Export Authorization

`desCreateProjectExportJob` returns `NexarGqlUnauthorizedExternalUser` on this account. Email drafted to support@nexar.com to clarify plan/permission requirements.

---

## Known Limitations / Future Work

- **BOM operations** (`datBomParts`, `datBomAnalyses`) — separate `dat*` namespace, not yet implemented
- **Tasks / Comments** — full CRUD available in schema, deprioritized
- **Triggers for New Release / New Comment** — not yet implemented
- **GraphQL subscriptions** — `desOnCommentUpdated` exists in schema (WebSocket); real-time triggers not implemented
- **`desLaunchWorkflow`** — could trigger Altium internal workflows from n8n
- **Export pagination** — triggers currently cap at 100 projects per page; workspace-wide polling handles pagination correctly via cursor loop

---

## Next Session Checklist

1. `npm install` if fresh clone
2. `npm run codegen` to regenerate GraphQL types
3. `npm run build` to verify clean compile
4. `git log --oneline` to see where we left off

---

**Last Updated:** 2026-03-31
**Current Version:** 1.3.2
**Current Tag:** v1.3.2

- When starting a new feature, add the test cases first (Test Driven Development) and then work on the actual code.
