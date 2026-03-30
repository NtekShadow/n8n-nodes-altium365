import type {
	IDataObject,
	IPollFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { NexarClient } from '../../shared/NexarClient';

interface WorkflowStaticData {
	lastRevisions?: Record<string, string>; // projectId -> revisionId
	lastProjectIds?: string[];
}

export class Altium365Trigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Altium 365 Trigger',
		name: 'altium365Trigger',
		icon: 'file:altium365trigger.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Triggers on Altium 365 events via polling',
		defaults: {
			name: 'Altium 365 Trigger',
		},
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'altium365NexarApi',
				required: true,
			},
		],
		polling: true,
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				options: [
					{
						name: 'Project Committed',
						value: 'projectCommitted',
						description: 'Trigger when a project is committed (Git push)',
					},
					{
						name: 'New Project',
						value: 'newProject',
						description: 'Trigger when a new project is created',
					},
				],
				default: 'projectCommitted',
				required: true,
			},

			// Project ID filter for projectCommitted event
			{
				displayName: 'Project ID',
				name: 'projectId',
				type: 'string',
				displayOptions: {
					show: {
						event: ['projectCommitted'],
					},
				},
				default: '',
				description:
					'Full project ID (grid:workspace:...:design:project/...) to monitor. Leave empty to monitor all projects.',
			},

			// Include file changes option
			{
				displayName: 'Include File Changes',
				name: 'includeFileChanges',
				type: 'boolean',
				displayOptions: {
					show: {
						event: ['projectCommitted'],
					},
				},
				default: true,
				description: 'Whether to include the list of changed files in the output',
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event') as string;
		console.log(`[Altium365Trigger] poll() called, event=${event}`);

		const credentials = await this.getCredentials('altium365NexarApi');
		const workspaceUrl = credentials.workspaceUrl as string;
		const apiUrl = credentials.apiEndpointUrl as string;
		console.log(`[Altium365Trigger] workspaceUrl=${workspaceUrl} apiUrl=${apiUrl}`);

		const client = new NexarClient(this, 'altium365NexarApi', apiUrl);

		const workflowStaticData = this.getWorkflowStaticData('node') as WorkflowStaticData;
		console.log(
			`[Altium365Trigger] staticData keys=${Object.keys(workflowStaticData).join(',')} revisionCount=${Object.keys(workflowStaticData.lastRevisions || {}).length}`,
		);

		if (event === 'projectCommitted') {
			return await Altium365Trigger.prototype.pollProjectCommitted.call(
				this,
				client,
				workspaceUrl,
				workflowStaticData,
			);
		}

		if (event === 'newProject') {
			return await Altium365Trigger.prototype.pollNewProjects.call(
				this,
				client,
				workspaceUrl,
				workflowStaticData,
			);
		}

		return null;
	}

	private async pollProjectCommitted(
		this: IPollFunctions,
		client: NexarClient,
		workspaceUrl: string,
		staticData: WorkflowStaticData,
	): Promise<INodeExecutionData[][] | null> {
		const projectId = this.getNodeParameter('projectId', '') as string;
		const includeFileChanges = this.getNodeParameter('includeFileChanges', true) as boolean;
		const sdk = client.getSdk();

		const isFirstRun = !staticData.lastRevisions;
		if (!staticData.lastRevisions) {
			staticData.lastRevisions = {};
			console.log('[Altium365Trigger] First run - establishing baseline');
		}

		const returnData: INodeExecutionData[] = [];

		if (projectId) {
			// Monitor a specific project
			console.log(`[Altium365Trigger] Fetching single project: ${projectId}`);
			const result = await sdk.GetLatestCommit({ projectId });

			if (!result.desProjectById) {
				throw new NodeOperationError(
					this.getNode(),
					`Project not found. Make sure you're using the full grid ID (e.g. grid:workspace:...:design:project/...)`,
				);
			}

			const project = result.desProjectById;
			const latestRevision = project.latestRevision;

			if (latestRevision) {
				const lastKnownRevision = staticData.lastRevisions[projectId];
				console.log(
					`[Altium365Trigger] "${project.name}": stored=${lastKnownRevision || '(none)'} current=${latestRevision.revisionId}`,
				);

				if (!isFirstRun && lastKnownRevision !== latestRevision.revisionId) {
					console.log('[Altium365Trigger] CHANGE DETECTED - firing event');
					const commitData: IDataObject = {
						projectId: project.id,
						projectName: project.name,
						revisionId: latestRevision.revisionId,
						message: latestRevision.message,
						author: latestRevision.author,
						committedAt: latestRevision.createdAt,
					};

					if (includeFileChanges) {
						commitData.filesChanged = latestRevision.files;
					}

					returnData.push({ json: commitData });
				}

				staticData.lastRevisions[projectId] = latestRevision.revisionId;
			}
		} else {
			// Monitor all projects - paginate through all pages
			console.log(
				`[Altium365Trigger] Fetching all projects with revisions for ${workspaceUrl}`,
			);

			const allProjects: Array<{
				id: string;
				name?: string | null;
				latestRevision?: {
					revisionId: string;
					message: string;
					author: string;
					createdAt: any;
					files: Array<{ kind: any; path: string }>;
				} | null;
			}> = [];

			let after: string | undefined;
			let pageNum = 0;

			do {
				pageNum++;
				const result = await sdk.GetProjectsWithRevisions({
					workspaceUrl,
					first: 100,
					after,
				});

				if (!result.desProjects?.nodes) {
					break;
				}

				allProjects.push(...result.desProjects.nodes);
				console.log(
					`[Altium365Trigger] Page ${pageNum}: got ${result.desProjects.nodes.length} projects (${allProjects.length}/${result.desProjects.totalCount} total)`,
				);

				if (result.desProjects.pageInfo.hasNextPage) {
					after = result.desProjects.pageInfo.endCursor ?? undefined;
				} else {
					break;
				}
			} while (after);

			if (allProjects.length === 0) {
				console.log('[Altium365Trigger] No projects found');
				return null;
			}

			const projects = allProjects;

			for (const project of projects) {
				const latestRevision = project.latestRevision;
				if (!latestRevision) {
					continue;
				}

				const lastKnownRevision = staticData.lastRevisions[project.id];

				if (
					!isFirstRun &&
					lastKnownRevision &&
					lastKnownRevision !== latestRevision.revisionId
				) {
					console.log(
						`[Altium365Trigger] CHANGE in "${project.name}": ${lastKnownRevision} -> ${latestRevision.revisionId}`,
					);
					const commitData: IDataObject = {
						projectId: project.id,
						projectName: project.name,
						revisionId: latestRevision.revisionId,
						message: latestRevision.message,
						author: latestRevision.author,
						committedAt: latestRevision.createdAt,
					};

					if (includeFileChanges) {
						commitData.filesChanged = latestRevision.files;
					}

					returnData.push({ json: commitData });
				}

				staticData.lastRevisions[project.id] = latestRevision.revisionId;
			}
		}

		console.log(
			`[Altium365Trigger] Poll complete: ${returnData.length} events, ${Object.keys(staticData.lastRevisions).length} projects tracked`,
		);

		if (returnData.length === 0) {
			return null;
		}

		return [returnData];
	}

	private async pollNewProjects(
		this: IPollFunctions,
		client: NexarClient,
		workspaceUrl: string,
		staticData: WorkflowStaticData,
	): Promise<INodeExecutionData[][] | null> {
		const sdk = client.getSdk();

		const isFirstRun = !staticData.lastProjectIds;
		if (!staticData.lastProjectIds) {
			staticData.lastProjectIds = [];
			console.log('[Altium365Trigger] First run for newProject - establishing baseline');
		}

		const result = await sdk.GetProjects({
			workspaceUrl,
			first: 100,
		});

		if (!result.desProjects?.nodes) {
			return null;
		}

		const returnData: INodeExecutionData[] = [];
		const currentProjectIds = result.desProjects.nodes.map((p) => p.id);

		if (!isFirstRun) {
			for (const project of result.desProjects.nodes) {
				if (!staticData.lastProjectIds.includes(project.id)) {
					console.log(`[Altium365Trigger] New project detected: "${project.name}"`);
					returnData.push({ json: project });
				}
			}
		}

		staticData.lastProjectIds = currentProjectIds;

		console.log(
			`[Altium365Trigger] newProject poll complete: ${returnData.length} new projects, ${currentProjectIds.length} tracked`,
		);

		if (returnData.length === 0) {
			return null;
		}

		return [returnData];
	}
}
