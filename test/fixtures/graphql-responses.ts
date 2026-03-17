// Mock GraphQL response fixtures for testing

export const mockWorkspaceResponse = {
	desWorkspaceInfos: [
		{
			url: 'https://workspace-1.365.altium.com',
			name: 'Engineering Workspace',
			location: 'US',
		},
		{
			url: 'https://workspace-2.365.altium.com',
			name: 'Manufacturing Workspace',
			location: 'EU',
		},
		{
			url: 'https://workspace-3.365.altium.com',
			name: 'R&D Workspace',
			location: 'AP',
		},
	],
};

export const mockProjectResponse = {
	desProjectById: {
		id: 'project-123',
		name: 'Test Project',
		description: 'A test project for unit testing',
		projectId: 'TEST-001',
		updatedAt: '2025-03-16T12:00:00Z',
		latestRevision: {
			revisionId: 'abc123def456',
			message: 'Initial commit',
			author: 'Test User',
			createdAt: '2025-03-16T10:00:00Z',
			files: [
				{
					kind: 'ADDED',
					path: 'schematic.schdoc',
				},
				{
					kind: 'ADDED',
					path: 'pcb.pcbdoc',
				},
			],
		},
	},
};

export const mockProjectsResponse = {
	desProjects: {
		nodes: [
			{
				id: 'project-123',
				name: 'Motor Controller Board',
				description: 'Rev B motor controller design',
				projectId: 'MOTOR-001',
				updatedAt: '2025-03-16T12:00:00Z',
			},
			{
				id: 'project-456',
				name: 'Power Supply Module',
				description: 'High efficiency power supply',
				projectId: 'PSU-042',
				updatedAt: '2025-03-15T12:00:00Z',
			},
			{
				id: 'project-789',
				name: 'Sensor Array PCB',
				description: 'Multi-sensor interface board',
				projectId: 'SENSOR-003',
				updatedAt: '2025-03-14T08:30:00Z',
			},
			{
				id: 'project-101',
				name: 'LED Driver Circuit',
				description: 'Constant current LED driver',
				projectId: 'LED-015',
				updatedAt: '2025-03-13T16:45:00Z',
			},
			{
				id: 'project-202',
				name: 'Communication Module',
				description: 'BLE and WiFi comm board',
				projectId: 'COMM-007',
				updatedAt: '2025-03-12T09:20:00Z',
			},
		],
		pageInfo: {
			hasNextPage: false,
			endCursor: null,
		},
	},
};

export const mockCommitHistoryResponse = {
	desProjectById: {
		id: 'project-123',
		revisions: {
			nodes: [
				{
					revisionId: 'commit-5',
					message: 'Updated component footprints',
					author: 'Jane Smith',
					createdAt: '2025-03-16T14:30:00Z',
					files: [
						{
							kind: 'MODIFIED',
							path: 'pcb.pcbdoc',
						},
						{
							kind: 'MODIFIED',
							path: 'Libraries/custom.pcblib',
						},
					],
				},
				{
					revisionId: 'commit-4',
					message: 'Added power supply schematic',
					author: 'John Doe',
					createdAt: '2025-03-15T11:20:00Z',
					files: [
						{
							kind: 'ADDED',
							path: 'Power/supply.schdoc',
						},
						{
							kind: 'MODIFIED',
							path: 'main.schdoc',
						},
					],
				},
				{
					revisionId: 'commit-3',
					message: 'Removed obsolete test points',
					author: 'Jane Smith',
					createdAt: '2025-03-14T16:45:00Z',
					files: [
						{
							kind: 'DELETED',
							path: 'test-points-old.schdoc',
						},
						{
							kind: 'MODIFIED',
							path: 'pcb.pcbdoc',
						},
					],
				},
				{
					revisionId: 'commit-2',
					message: 'Fixed routing issues on layer 2',
					author: 'Bob Wilson',
					createdAt: '2025-03-13T09:30:00Z',
					files: [
						{
							kind: 'MODIFIED',
							path: 'pcb.pcbdoc',
						},
					],
				},
				{
					revisionId: 'commit-1',
					message: 'Initial project setup',
					author: 'John Doe',
					createdAt: '2025-03-12T10:00:00Z',
					files: [
						{
							kind: 'ADDED',
							path: 'main.schdoc',
						},
						{
							kind: 'ADDED',
							path: 'pcb.pcbdoc',
						},
						{
							kind: 'ADDED',
							path: 'Project.prjpcb',
						},
						{
							kind: 'NONE',
							path: '.gitignore',
						},
					],
				},
			],
			pageInfo: {
				hasNextPage: false,
				endCursor: null,
			},
		},
	},
};

export const mockProjectWithNullRevision = {
	desProjectById: {
		id: 'project-789',
		name: 'Simple Sync Project',
		description: 'Project using Simple Sync (no Git)',
		projectId: 'TEST-003',
		updatedAt: '2025-03-16T12:00:00Z',
		latestRevision: null,
	},
};

export const mockGraphQLError = {
	errors: [
		{
			message: 'Project not found',
			extensions: {
				code: 'NOT_FOUND',
			},
		},
	],
};
