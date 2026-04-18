import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	IPollFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { NexarClient } from '../../shared/NexarClient';
import { log } from '../../shared/log';

interface WorkflowStaticData {
	lastRevisions?: Record<string, string>; // projectId -> revisionId
	lastPollTime?: string; // ISO timestamp of last successful poll
	lastProjectIds?: string[];
	// Component tracking: componentId -> "modifiedAt|revisionId"
	lastComponentState?: Record<string, string>;
}

export class Altium365Trigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Altium 365 Trigger',
		name: 'altium365Trigger',
		icon: 'file:altium365trigger.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Löst aus bei Altium 365 Ereignissen über Polling',
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
				displayName: 'Ereignis',
				name: 'event',
				type: 'options',
				options: [
					{
						name: 'Projekt committet',
						value: 'projectCommitted',
						description: 'Löst aus, wenn ein Projekt committet wird (Git Push)',
					},
					{
						name: 'Neues Projekt',
						value: 'newProject',
						description: 'Löst aus, wenn ein neues Projekt erstellt wird',
					},
					{
						name: 'Komponente aktualisiert',
						value: 'componentUpdated',
						description:
							'Löst aus, wenn eine Bibliothekskomponente erstellt oder modifiziert wird',
					},
				],
				default: 'projectCommitted',
				required: true,
			},

			// Projekt-ID Filter für projectCommitted Ereignis
			{
				displayName: 'Projekt',
				name: 'projectId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				displayOptions: {
					show: {
						event: ['projectCommitted'],
					},
				},
				description: 'Wählen Sie ein spezifisches Projekt zur Überwachung oder lassen Sie leer, um alle zu überwachen.',
				modes: [
					{
						displayName: 'Aus Liste',
						name: 'list',
						type: 'list',
						placeholder: 'Projekt auswählen...',
						typeOptions: {
							searchListMethod: 'searchProjects',
							searchable: true,
						},
					},
					{
						displayName: 'Nach ID',
						name: 'id',
						type: 'string',
						placeholder: 'grid:workspace:...:design:project/...',
					},
				],
			},

			// Option für Dateiänderungen einschließen
			{
				displayName: 'Dateiänderungen einschließen',
				name: 'includeFileChanges',
				type: 'boolean',
				displayOptions: {
					show: {
						event: ['projectCommitted'],
					},
				},
				default: true,
				description: 'Gibt an, ob die Liste der geänderten Dateien in der Ausgabe enthalten sein soll',
			},

			// Poll-Intervall Drosselung (n8n bietet standardmäßig nur 1min oder 1h)
			{
				displayName: 'Minimales Abfrageintervall',
				name: 'pollIntervalMinutes',
				type: 'options',
				options: [
					{ name: '1 Minute', value: 1 },
					{ name: '5 Minuten', value: 5 },
					{ name: '10 Minuten', value: 10 },
					{ name: '15 Minuten', value: 15 },
					{ name: '30 Minuten', value: 30 },
					{ name: '1 Stunde', value: 60 },
				],
				default: 5,
				description:
					'Mindeste Zeit zwischen API-Abfragen. Setzen Sie n8n Poll Times auf "Jede Minute" und dies kontrolliert das tatsächliche Intervall.',
			},
		],
	};

	methods = {
		listSearch: {
			async searchProjects(
				this: ILoadOptionsFunctions,
				filter?: string,
				paginationToken?: string,
			): Promise<INodeListSearchResult> {
				const credentials = await this.getCredentials('altium365NexarApi');
				const apiUrl = credentials.apiEndpointUrl as string;
				const workspaceUrl = credentials.workspaceUrl as string;
				const client = new NexarClient(this, 'altium365NexarApi', apiUrl);
				const sdk = client.getSdk();

				const result = await sdk.GetProjects({
					workspaceUrl,
					first: 50,
					after: paginationToken as string | undefined,
				});

				let items = (result.desProjects?.nodes ?? []).map((p) => ({
					name: p.name || p.id,
					value: p.id,
				}));

				if (filter) {
					const f = filter.toLowerCase();
					items = items.filter((i) => i.name.toLowerCase().includes(f));
				}

				// Prepend the "all projects" option on the first unfiltered page
				if (!filter && !paginationToken) {
					items.unshift({ name: '(All Projects)', value: '' });
				}

				return {
					results: items,
					paginationToken:
						result.desProjects?.pageInfo.hasNextPage
							? (result.desProjects.pageInfo.endCursor ?? undefined)
							: undefined,
				};
			},
		},
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event') as string;
		const pollIntervalMinutes = this.getNodeParameter('pollIntervalMinutes', 5) as number;

		const workflowStaticData = this.getWorkflowStaticData('node') as WorkflowStaticData;

		// Throttle: skip if not enough time has passed since last poll
		// 5-second buffer accounts for n8n timer jitter
		if (workflowStaticData.lastPollTime) {
			const elapsedMs =
				Date.now() - new Date(workflowStaticData.lastPollTime).getTime();
			const thresholdMs = pollIntervalMinutes * 60000 - 5000;
			if (elapsedMs < thresholdMs) {
				return null;
			}
		}

		log('Altium365Trigger', `poll() running, event=${event}`);

		const credentials = await this.getCredentials('altium365NexarApi');
		const workspaceUrl = credentials.workspaceUrl as string;
		const apiUrl = credentials.apiEndpointUrl as string;

		const client = new NexarClient(this, 'altium365NexarApi', apiUrl);

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

		if (event === 'componentUpdated') {
			return await Altium365Trigger.prototype.pollComponentUpdated.call(
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
		const projectId = this.getNodeParameter('projectId', '', { extractValue: true }) as string;
		const includeFileChanges = this.getNodeParameter('includeFileChanges', true) as boolean;
		const sdk = client.getSdk();

		const isFirstRun = !staticData.lastRevisions;
		if (!staticData.lastRevisions) {
			staticData.lastRevisions = {};
			log('Altium365Trigger', 'First run - establishing baseline');
		}

		const returnData: INodeExecutionData[] = [];

		if (projectId) {
			log('Altium365Trigger', `Fetching single project: ${projectId}`);
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
				log('Altium365Trigger', `"${project.name}": stored=${lastKnownRevision || '(none)'} current=${latestRevision.revisionId}`);

				if (!isFirstRun && lastKnownRevision !== latestRevision.revisionId) {
					log('Altium365Trigger', 'CHANGE DETECTED - firing event');
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
			const lastPollTime = staticData.lastPollTime;
			const pollStartTime = new Date().toISOString();

			const where =
				!isFirstRun && lastPollTime
					? { updatedAt: { gte: lastPollTime } }
					: undefined;

			if (where) {
				log('Altium365Trigger', `Incremental poll: fetching projects updated since ${lastPollTime}`);
			} else {
				log('Altium365Trigger', `Full poll: fetching all projects for ${workspaceUrl}`);
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
				log('Altium365Trigger', 
					`Page ${pageNum}: got ${result.desProjects.nodes.length} projects (${allProjects.length}/${result.desProjects.totalCount} total)`,
				);

				if (result.desProjects.pageInfo.hasNextPage) {
					after = result.desProjects.pageInfo.endCursor ?? undefined;
				} else {
					break;
				}
			} while (after);

			if (isFirstRun && allProjects.length === 0) {
				log('Altium365Trigger', 'No projects found in workspace');
				staticData.lastPollTime = pollStartTime;
				return null;
			}

			for (const project of allProjects) {
				if (isFirstRun) {
					if (project.latestRevision) {
						staticData.lastRevisions[project.id] = project.latestRevision.revisionId;
					}
					continue;
				}

				const latestRevision = project.latestRevision;
				const lastKnownRevision = staticData.lastRevisions[project.id];
				const isNewCommit =
					latestRevision && lastKnownRevision !== latestRevision.revisionId;

				log('Altium365Trigger', 
					`CHANGE in "${project.name}": type=${isNewCommit ? 'commit' : 'metadata'} rev=${lastKnownRevision || '(new)'} -> ${latestRevision?.revisionId || '(none)'}`,
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

		log('Altium365Trigger', 
			`Poll complete: ${returnData.length} events, ${Object.keys(staticData.lastRevisions).length} projects tracked`,
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
			log('Altium365Trigger', 'First run for newProject - establishing baseline');
		}

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
					log('Altium365Trigger', `New project detected: "${project.name}"`);
					returnData.push({ json: project });
				}
			}
		}

		for (const project of result.desProjects.nodes) {
			if (!staticData.lastProjectIds.includes(project.id)) {
				staticData.lastProjectIds.push(project.id);
			}
		}

		staticData.lastPollTime = pollStartTime;

		log('Altium365Trigger', 
			`newProject poll complete: ${returnData.length} new projects, ${staticData.lastProjectIds.length} tracked`,
		);

		if (returnData.length === 0) {
			return null;
		}

		return [returnData];
	}

	private async pollComponentUpdated(
		this: IPollFunctions,
		client: NexarClient,
		workspaceUrl: string,
		staticData: WorkflowStaticData,
	): Promise<INodeExecutionData[][] | null> {
		const sdk = client.getSdk();

		const isFirstRun = !staticData.lastComponentState;
		if (!staticData.lastComponentState) {
			staticData.lastComponentState = {};
			log('Altium365Trigger', 'First run for components - establishing baseline');
		}

		const pollStartTime = new Date().toISOString();

		// Fetch all components - no server-side date filter available
		const allComponents: Array<{
			id: string;
			name: string;
			description: string;
			comment: string;
			createdAt: string;
			modifiedAt: string;
			revisionId: string;
			isManaged: boolean;
			componentType?: { name: string } | null;
			createdBy: { userName?: string | null; email?: string | null };
		}> = [];

		let after: string | undefined;
		let pageNum = 0;

		do {
			pageNum++;
			const result = await sdk.GetLibraryComponents({
				workspaceUrl,
				first: 100,
				after,
			});

			const components = result.desLibrary?.components;
			if (!components?.nodes) {
				break;
			}

			allComponents.push(...components.nodes);
			log('Altium365Trigger', 
				`Components page ${pageNum}: got ${components.nodes.length} (${allComponents.length}/${components.totalCount} total)`,
			);

			if (components.pageInfo.hasNextPage) {
				after = components.pageInfo.endCursor ?? undefined;
			} else {
				break;
			}
		} while (after);

		log('Altium365Trigger', 
			`Fetched ${allComponents.length} components total`,
		);

		const returnData: INodeExecutionData[] = [];

		for (const component of allComponents) {
			// Track state as "modifiedAt|revisionId" to detect any change
			const currentState = `${component.modifiedAt}|${component.revisionId}`;
			const lastState = staticData.lastComponentState[component.id];

			if (!isFirstRun && lastState !== currentState) {
				const isNew = !lastState;
				log('Altium365Trigger', 
					`Component ${isNew ? 'CREATED' : 'UPDATED'}: "${component.name}" (${component.id.substring(0, 40)}...)`,
				);

				returnData.push({
					json: {
						componentId: component.id,
						componentName: component.name,
						description: component.description,
						comment: component.comment,
						componentType: component.componentType?.name || null,
						changeType: isNew ? 'created' : 'updated',
						createdAt: component.createdAt,
						modifiedAt: component.modifiedAt,
						revisionId: component.revisionId,
						isManaged: component.isManaged,
						createdBy: component.createdBy,
					},
				});
			}

			staticData.lastComponentState[component.id] = currentState;
		}

		staticData.lastPollTime = pollStartTime;

		log('Altium365Trigger', 
			`Component poll complete: ${returnData.length} events, ${Object.keys(staticData.lastComponentState).length} components tracked`,
		);

		if (returnData.length === 0) {
			return null;
		}

		return [returnData];
	}
}
