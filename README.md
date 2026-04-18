# Fork Notice: This is a fork of the original n8n-nodes-altium, modified specifically for n8n AI Agents (removed loadOptions, optimized parameter visibility for LLMs).

# @ntek/n8n-nodes-altium365

This is an n8n community node that integrates n8n with Altium 365 via the Nexar GraphQL API.

[n8n](https://n8n.io/) is a workflow automation platform with a visual editor.

[Altium 365](https://www.altium.com/altium-365) is a cloud platform for electronics design collaboration.

[Nexar API](https://nexar.com/api) is the GraphQL API for programmatic access to Altium 365 data.

## Features

### Action Node (Altium 365)

**Projects**
- Get project by ID
- Get many projects (with pagination)
- Get latest commit for a project
- Get commit history for a project
- Update project parameters

**Workspaces**
- Get all workspaces

### Trigger Node (Altium 365 Trigger)

**Events**
- **Project Committed** - Triggers when a project is committed (Git push detected)
  - Monitor specific project or all projects in workspace
  - Includes file change details
  - Returns commit message, author, timestamp
- **New Project** - Triggers when a new project is created in the workspace

## Installation

### In n8n (recommended)

1. Go to **Settings** > **Community Nodes**
2. Select **Install**
3. Enter `@ntek/n8n-nodes-altium365` in **Enter npm package name**
4. Agree to the risks of using community nodes
5. Select **Install**

After installing the node, you can use it in your workflows.

### Manual Installation

To install manually, navigate to your n8n installation directory and run:

```bash
npm install @ntek/n8n-nodes-altium365
```

For Docker-based deployments, add this to your `package.json` or Dockerfile.

## Credentials

This node requires Altium 365 Nexar API credentials.

### Setting up Nexar API Access

1. **Sign up at Nexar Portal**
   - Go to [portal.nexar.com](https://portal.nexar.com/)
   - Sign in with your Altium Live credentials (they link automatically)

2. **Create an Application**
   - Click **Create Application**
   - Give it a name (e.g., "n8n Integration")
   - Enable the **Design** scope
   - Save the application

3. **Get Credentials**
   - Go to the **Authorization** tab
   - Copy the **Client ID**
   - Copy the **Client Secret** (guard this carefully!)

4. **Find Your Workspace URL**
   - Your workspace URL follows the format: `https://YOURWORKSPACE.365.altium.com/`
   - You can find this in your Altium 365 web interface URL

### Configuring in n8n

1. In n8n, create a new credential of type **Altium 365 Nexar API**
2. Enter your **Client ID**
3. Enter your **Client Secret**
4. Enter your **Workspace URL** (e.g., `https://mycompany.365.altium.com/`)
5. Test the credential to verify it works

## Usage

### Example: Monitor Project Commits

Set up a workflow that triggers whenever a project is committed:

1. Add **Altium 365 Trigger** node
2. Select event: **Project Committed**
3. (Optional) Enter a specific **Project ID** to monitor one project, or leave blank to monitor all projects
4. Connect to any action (Slack notification, email, webhook, etc.)

The trigger outputs:
```json
{
  "projectId": "abc123",
  "projectName": "PowerSupply_v2",
  "revisionId": "e4f8a9b2c1d3",
  "message": "Fixed power rail routing on layer 3",
  "author": "John Smith",
  "committedAt": "2025-03-14T10:23:00Z",
  "filesChanged": [
    {
      "kind": "MODIFIED",
      "path": "PowerBoard.PcbDoc"
    },
    {
      "kind": "MODIFIED",
      "path": "PowerSchematic.SchDoc"
    }
  ]
}
```

### Example: Get Project Details

1. Add **Altium 365** action node
2. Select resource: **Project**
3. Select operation: **Get**
4. Enter the **Project ID**

Returns complete project information including metadata, parameters, and variant count.

### Example: List All Projects

1. Add **Altium 365** action node
2. Select resource: **Project**
3. Select operation: **Get Many**
4. Choose **Return All** or set a **Limit**

Returns paginated list of all projects in your workspace.

## API Rate Limits

- Design queries are **free and unlimited** with an active Altium 365 subscription
- OAuth tokens are valid for 24 hours and automatically refreshed
- The node caches tokens to minimize authentication requests

## Development

### Prerequisites

- Node.js >= 18.17.0
- npm >= 10.x
- Active Altium 365 subscription
- Nexar API credentials with Design scope

### Setup

```bash
# Clone the repository
git clone https://github.com/NtekShadow/n8n-nodes-altium365.git
cd n8n-nodes-altium365  # Note: package is published as @ntek/n8n-nodes-altium365

# Install dependencies
npm install

# Generate GraphQL types from Nexar schema
npm run codegen

# Build the node
npm run build

# Run linter
npm run lint

# Format code
npm run format
```

### Project Structure

```
@ntek/n8n-nodes-altium365/
├── credentials/
│   └── Altium365NexarApi.credentials.ts  # OAuth2 credentials
├── nodes/
│   ├── Altium365/
│   │   ├── Altium365.node.ts             # Main action node
│   │   └── altium365.svg                 # Node icon
│   └── Altium365Trigger/
│       ├── Altium365Trigger.node.ts      # Polling trigger node
│       └── altium365trigger.svg          # Trigger icon
├── shared/
│   ├── NexarClient.ts                    # GraphQL client with token caching
│   ├── queries/                          # GraphQL query definitions
│   │   ├── workspace.graphql
│   │   └── projects.graphql
│   └── generated/
│       └── graphql.ts                    # Auto-generated types from schema
└── package.json
```

### GraphQL Code Generation

This package uses GraphQL Code Generator to create fully typed SDK from the Nexar schema:

```bash
# Regenerate types after modifying .graphql files
npm run codegen
```

The codegen:
1. Introspects the Nexar GraphQL schema
2. Validates your queries against the schema
3. Generates TypeScript types and SDK functions
4. Provides full autocomplete and type safety

## Compatibility

- Tested with n8n version: 1.x
- Node.js: >= 18.17.0
- Altium 365: Current version (2025)

## Resources

- [n8n Documentation](https://docs.n8n.io/)
- [Nexar API Documentation](https://nexar.com/api)
- [Nexar Portal](https://portal.nexar.com/)
- [Altium 365](https://www.altium.com/altium-365)

## License

[MIT](LICENSE.md)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions:
- [GitHub Issues](https://github.com/NtekShadow/n8n-nodes-altium365/issues)
- [Nexar Community](https://community.nexar.com/)

## Changelog

See [CHANGELOG.md](CHANGELOG.md)
