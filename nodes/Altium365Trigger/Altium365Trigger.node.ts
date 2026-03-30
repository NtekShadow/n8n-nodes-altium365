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
	lastPollTime?: string; // ISO timestamp of last successful poll
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

			// Poll interval throttle (n8n only offers 1min or 1hr natively)
			{
				displayName: 'Minimum Poll Interval',
				name: 'pollIntervalMinutes',
				type: 'options',
				options: [
					{ name: '1 Minute', value: 1 },
					{ name: '5 Minutes', value: 5 },
					{ name: '10 Minutes', value: 10 },
					{ name: '15 Minutes', value: 15 },
					{ name: '30 Minutes', value: 30 },
					{ name: '1 Hour', value: 60 },
				],
				default: 5,
				description:
					'Minimum time between API polls. Set n8n Poll Times to "Every Minute" and this controls the actual interval.',
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event') as string;
		const pollIntervalMinutes = this.getNodeParameter('pollIntervalMinutes', 5) as number;

		const workflowStaticData = this.getWorkflowStaticData('node') as WorkflowStaticData;

		// Throttle: skip if not enough time has passed since last poll
		if (workflowStaticData.lastPollTime) {
			const elapsed =
				(Date.now() - new Date(workflowStaticData.lastPollTime).getTime()) / 60000;
			if (elapsed < pollIntervalMinutes) {
				return null;
			}
		}

		console.log(`[Altium365Trigger] poll() running, event=${event}`);

		const credentials = await this.getCredentials('altium365NexarApi');
		const workspaceUrl = credentials.workspaceUrl as string;
		const apiUrl = credentials.apiEndpointUrl as string;

		const client = new NexarClient(this, 'altium365NexarApi', apiUrl);

		console.log(
			`[Altium365Trigger] revisionCount=${Object.keys(workflowStaticData.lastRevisions || {}).length} lastPollTime=${workflowStaticData.lastPollTime || '(none)'}`,
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
			// Monitor a specific project - single query
			console.log(`[Altium365Trigger] Fetching single project: ${projectId}`);
			const result = await sdk.GetLatestCommit({ projectId });

			if (!result.desProjectById) {
				throw new NodeOperationError(
					this.getNode(),
					'Project not found. Make sure you\'re using the full grid ID (e.g. grid:workspace:...:design:project/...)',
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
			// Monitor all projects
			// First run: full fetch to build baseline
			// Subsequent runs: only fetch projects updated since last poll
			const lastPollTime = staticData.lastPollTime;
			const pollStartTime = new Date().toISOString();

			const where =
				!isFirstRun && lastPollTime
					? { updatedAt: { gte: lastPollTime } }
					: undefined;

			if (where) {
				console.log(
					`[Altium365Trigger] Incremental poll: fetching projects updated since ${lastPollTime}`,
				);
			} else {
				console.log(
					`[Altium365Trigger] Full poll: fetching all projects for ${workspaceUrl}`,
				);
			}

			const allProjects: Array<{
				id: string;
				name?: string | null;
				updatedAt: string;
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
					where,
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

			// On first run with no results, that's fine - empty workspace
			if (isFirstRun && allProjects.length === 0) {
				console.log('[Altium365Trigger] No projects found in workspace');
				staticData.lastPollTime = pollStartTime;
				return null;
			}

			for (const project of allProjects) {
				if (isFirstRun) {
					// Store baseline only
					if (project.latestRevision) {
						staticData.lastRevisions[project.id] = project.latestRevision.revisionId;
					}
					continue;
				}

				// Any project returned by the incremental query has been updated
				const latestRevision = project.latestRevision;
				const lastKnownRevision = staticData.lastRevisions[project.id];
				const isNewCommit =
					latestRevision && lastKnownRevision !== latestRevision.revisionId;

				console.log(
					`[Altium365Trigger] CHANGE in "${project.name}": type=${isNewCommit ? 'commit' : 'metadata'} rev=${lastKnownRevision || '(new)'} -> ${latestRevision?.revisionId || '(none)'}`,
				);

				const eventData: IDataObject = {
					projectId: project.id,
					projectName: project.name,
					updatedAt: project.updatedAt,
					changeType: isNewCommit ? 'commit' : 'metadata',
				};

				if (latestRevision) {
					eventData.revisionId = latestRevision.revisionId;
					eventData.message = latestRevision.message;
					eventData.author = latestRevision.author;
					eventData.committedAt = latestRevision.createdAt;

					if (includeFileChanges) {
						eventData.filesChanged = latestRevision.files;
					}

					staticData.lastRevisions[project.id] = latestRevision.revisionId;
				}

				returnData.push({ json: eventData });
			}

			staticData.lastPollTime = pollStartTime;
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

		// Use createdAt filter on subsequent runs to only get new projects
		const lastPollTime = staticData.lastPollTime;
		const pollStartTime = new Date().toISOString();
		const where =
			!isFirstRun && lastPollTime ? { createdAt: { gte: lastPollTime } } : undefined;

		const result = await sdk.GetProjects({
			workspaceUrl,
			first: 100,
			where,
		});

		if (!result.desProjects?.nodes) {
			staticData.lastPollTime = pollStartTime;
			return null;
		}

		const returnData: INodeExecutionData[] = [];

		if (!isFirstRun) {
			for (const project of result.desProjects.nodes) {
				if (!staticData.lastProjectIds.includes(project.id)) {
					console.log(`[Altium365Trigger] New project detected: "${project.name}"`);
					returnData.push({ json: project });
				}
			}
		}

		// Update tracked project IDs with any new ones
		for (const project of result.desProjects.nodes) {
			if (!staticData.lastProjectIds.includes(project.id)) {
				staticData.lastProjectIds.push(project.id);
			}
		}

		staticData.lastPollTime = pollStartTime;

		console.log(
			`[Altium365Trigger] newProject poll complete: ${returnData.length} new projects, ${staticData.lastProjectIds.length} tracked`,
		);

		if (returnData.length === 0) {
			return null;
		}

		return [returnData];
	}
}
