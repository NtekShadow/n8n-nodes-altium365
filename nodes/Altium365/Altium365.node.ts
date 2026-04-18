import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { NexarClient } from '../../shared/NexarClient';
import { log } from '../../shared/log';

async function pollJob<T>(
	pollFn: () => Promise<T>,
	isComplete: (result: T) => boolean,
	isError: (result: T) => boolean,
	getErrorMessage: (result: T) => string,
	pollIntervalMs: number,
	timeoutMs: number,
): Promise<T> {
	const startTime = Date.now();
	while (Date.now() - startTime < timeoutMs) {
		const result = await pollFn();
		if (isComplete(result)) return result;
		if (isError(result)) throw new Error(getErrorMessage(result));
		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}
	throw new Error(`Job timed out after ${timeoutMs / 1000} seconds`);
}

export class Altium365 implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Altium 365',
		name: 'altium365',
		icon: 'file:altium365.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interagiert mit Altium 365 über die Nexar API für Projektmanagement, Exporte und Workspace-Operationen',
		defaults: {
			name: 'Altium 365',
		},
		inputs: ['main'],
		outputs: ['main'],
		usableAsTool: true,
		credentials: [
			{
				name: 'altium365NexarApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Ressource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				required: true,
				description: 'The resource to operate on. Send "project" for project management operations (get details, commits, updates), "export" for export operations (Gerber, NCDrill, packages), "workspace" for workspace information.',
				options: [
					{
						name: 'Export',
						value: 'export',
					},
					{
						name: 'Projekt',
						value: 'project',
					},
					{
						name: 'Workspace',
						value: 'workspace',
					},
				],
				default: 'project',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				required: true,
				description: 'The operation to perform. For resource "project": send "get" to retrieve full project details, "getSimplified" for basic info (ID, name, description, status), "getMany" for paginated list, "getLatestCommit" for latest commit, "getCommitHistory" for commit history, "updateParameters" to update project parameters. For "export": "downloadReleasePackage" for release downloads, "exportProjectFiles" for Gerber/NCDrill exports, "createManufacturePackage" for manufacture packages. For "workspace": "getAll" to get all workspaces.',
				options: [
					// Project operations
					{
						name: 'Projekt abrufen',
						value: 'get',
					},
					{
						name: 'Projekt abrufen (vereinfacht)',
						value: 'getSimplified',
					},
					{
						name: 'Projekte abrufen (mehrere)',
						value: 'getMany',
					},
					{
						name: 'Neuesten Commit abrufen',
						value: 'getLatestCommit',
					},
					{
						name: 'Commit-Verlauf abrufen',
						value: 'getCommitHistory',
					},
					{
						name: 'Parameter aktualisieren',
						value: 'updateParameters',
					},
					// Export operations
					{
						name: 'Release-Paket herunterladen',
						value: 'downloadReleasePackage',
					},
					{
						name: 'Projektdateien exportieren',
						value: 'exportProjectFiles',
					},
					{
						name: 'Fertigungspaket erstellen',
						value: 'createManufacturePackage',
					},
					// Workspace operations
					{
						name: 'Alle Workspaces abrufen',
						value: 'getAll',
					},
				],
				default: 'get',
			},

			// ==================== Shared fields ====================

			// Projekt-ID (verwendet von Projekt- und Export-Operationen)
			{
				displayName: 'Projekt-ID',
				name: 'projectId',
				type: 'string',
				default: '',
				description: 'The exact project ID as a string (e.g., "grid:workspace:...:design:project/..."). Required for project and export operations.',
			},

			// Limit-Feld
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				description: 'Maximum number of results to return. Used for getMany and getCommitHistory operations.',
			},

			// Alle zurückgeben Toggle
			{
				displayName: 'Alle zurückgeben',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description: 'Whether to return all results or limit to a specific number. Used for getMany and getCommitHistory operations.',
			},

			// ==================== Projekt: Parameter aktualisieren ====================

			{
				displayName: 'Parameter',
				name: 'parameters',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				description: 'The parameters to set for the project. Used for updateParameters operation.',
				options: [
					{
						name: 'parameter',
						displayName: 'Parameter',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								description: 'Parameter-Name',
								placeholder: 'z.B. DesignRuleCheck',
							},
							{
								displayName: 'Wert',
								name: 'value',
								type: 'string',
								default: '',
								description: 'Parameter-Wert',
								placeholder: 'z.B. Enabled',
							},
						],
					},
				],
			},
			{
				displayName: 'Vorhandene ersetzen',
				name: 'replaceExisting',
				type: 'boolean',
				default: false,
				description: 'Whether to replace all existing parameters. If disabled, parameters are appended or updated by name. Used for updateParameters operation.',
			},

			// ==================== Export: Release-Paket herunterladen ====================

			{
				displayName: 'Release-ID',
				name: 'releaseId',
				type: 'string',
				default: '',
				description: 'The exact release ID as a string. Required for downloadReleasePackage operation.',
			},

			// ==================== Export: Projektdateien exportieren ====================

			{
				displayName: 'Export-Typ',
				name: 'exportType',
				type: 'options',
				required: true,
				options: [
					{ name: 'Gerber', value: 'Gerber' },
					{ name: 'Gerber X2', value: 'GerberX2' },
					{ name: 'IDF', value: 'IDF' },
					{ name: 'NC Drill', value: 'NCDrill' },
					{ name: 'Benutzerdefiniertes OutJob', value: 'CustomOutJob' },
				],
				default: 'Gerber',
				description: 'The type of project export to create. Used for exportProjectFiles operation.',
			},
			{
				displayName: 'OutJob-Inhalt',
				name: 'outJobContent',
				type: 'string',
				typeOptions: {
					rows: 10,
				},
				default: '',
				description: 'The content of an Altium Designer OutJob file. Required when exportType is CustomOutJob.',
				placeholder: 'Fügen Sie hier den OutJob-XML-Inhalt ein...',
			},

			// ==================== Export: Create Manufacture Package ====================

			{
				displayName: 'Paket-Name',
				name: 'packageName',
				type: 'string',
				default: '',
				description: 'The name for the manufacture package. Required for createManufacturePackage operation.',
				placeholder: 'z.B. MeinFertigungspaket_v1.0',
			},
			{
				displayName: 'Teilen mit (E-Mail-Adressen)',
				name: 'shareWithEmails',
				type: 'string',
				default: '',
				description: 'Comma-separated email addresses of manufacturers to share with. Optional for createManufacturePackage operation.',
				placeholder: 'hersteller1@example.com, hersteller2@example.com',
			},
			{
				displayName: 'Paket-Beschreibung',
				name: 'packageDescription',
				type: 'string',
				default: '',
				description: 'Optional description for the package. Used for createManufacturePackage operation.',
				placeholder: 'Optionale Beschreibung des Fertigungspakets',
			},
			{
				displayName: 'Callback-URL',
				name: 'callbackUrl',
				type: 'string',
				default: '',
				description: 'Optional webhook URL. If provided, Nexar will POST the result here when the package is ready, and the node returns immediately with the job ID instead of waiting. Use an n8n Webhook Trigger Node URL for asynchronous workflows. Used for createManufacturePackage operation.',
				placeholder: 'https://mein-n8n-instance.com/webhook/...',
			},

			// ==================== Export: Shared optional fields ====================

			{
				displayName: 'Varianten-Name',
				name: 'variantName',
				type: 'string',
				default: '',
				description: 'The exact variant name as a string. Optional for export operations.',
			},
			{
				displayName: 'Revision-ID',
				name: 'revisionId',
				type: 'string',
				default: '',
				description: 'The exact revision ID as a string. Optional for export operations; leave empty for latest version.',
			},
			{
				displayName: 'Dateiname',
				name: 'exportFileName',
				type: 'string',
				default: '',
				description: 'Optional output filename (e.g., "MyExport.zip"). Used for exportProjectFiles operation.',
				placeholder: 'z.B. MeinExport.zip',
			},

			// ==================== Export: Async job settings ====================

			{
				displayName: 'Timeout (Sekunden)',
				name: 'timeout',
				type: 'number',
				typeOptions: {
					minValue: 30,
				},
				default: 300,
				description: 'Maximum wait time for job completion (default 5 minutes). Used for export operations.',
			},
			{
				displayName: 'Abfrageintervall (Sekunden)',
				name: 'pollInterval',
				type: 'number',
				typeOptions: {
					minValue: 1,
					maxValue: 30,
				},
				default: 5,
				description: 'How often to check the job status. Used for export operations.',
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

				return {
					results: items,
					paginationToken:
						result.desProjects?.pageInfo.hasNextPage
							? (result.desProjects.pageInfo.endCursor ?? undefined)
							: undefined,
				};
			},
		},

		loadOptions: {
			async getReleases(
				this: ILoadOptionsFunctions,
			): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials('altium365NexarApi');
				const apiUrl = credentials.apiEndpointUrl as string;
				const projectId = this.getCurrentNodeParameter('projectId', { extractValue: true }) as string;

				if (!projectId) return [];

				const client = new NexarClient(this, 'altium365NexarApi', apiUrl);
				const sdk = client.getSdk();
				const result = await sdk.GetProjectReleases({ projectId });

				const releases = result.desProjectById?.design?.releases?.nodes ?? [];
				return releases.map((r) => ({
					name: `${r.releaseId} - ${r.description || '(no description)'}`,
					value: r.id,
				}));
			},

			async getVariants(
				this: ILoadOptionsFunctions,
			): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials('altium365NexarApi');
				const apiUrl = credentials.apiEndpointUrl as string;
				const projectId = this.getCurrentNodeParameter('projectId', { extractValue: true }) as string;

				if (!projectId) return [{ name: '(Default Variant)', value: '' }];

				const client = new NexarClient(this, 'altium365NexarApi', apiUrl);
				const sdk = client.getSdk();
				const result = await sdk.GetProjectVariants({ projectId });

				const variants = result.desProjectById?.design?.variants ?? [];
				return [
					{ name: '(Default Variant)', value: '' },
					...variants.map((v) => ({ name: v.name, value: v.name })),
				];
			},

			async getRevisions(
				this: ILoadOptionsFunctions,
			): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials('altium365NexarApi');
				const apiUrl = credentials.apiEndpointUrl as string;
				const projectId = this.getCurrentNodeParameter('projectId', { extractValue: true }) as string;

				if (!projectId) return [{ name: '(Latest Version)', value: '' }];

				const client = new NexarClient(this, 'altium365NexarApi', apiUrl);
				const sdk = client.getSdk();
				const result = await sdk.GetCommitHistory({ projectId, first: 50 });

				const commits = result.desProjectById?.revisions?.nodes ?? [];
				return [
					{ name: '(Latest Version)', value: '' },
					...commits.map((c) => {
						const shortHash = c.revisionId.substring(0, 7);
						const date = new Date(c.createdAt).toLocaleDateString();
						const msg = c.message.length > 60 ? c.message.substring(0, 57) + '...' : c.message;
						return {
							name: `${shortHash} - ${msg} (${date})`,
							value: c.revisionId,
						};
					}),
				];
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		const credentials = await this.getCredentials('altium365NexarApi');
		const apiUrl = credentials.apiEndpointUrl as string;

		const client = new NexarClient(this, 'altium365NexarApi', apiUrl);
		const sdk = client.getSdk();

		for (let i = 0; i < items.length; i++) {
			try {
				if (resource === 'workspace') {
					if (operation === 'getAll') {
						const result = await sdk.GetWorkspaceInfos();

						if (!result.desWorkspaceInfos) {
							throw new NodeOperationError(this.getNode(), 'No workspaces found');
						}

						result.desWorkspaceInfos.forEach((workspace) => {
							returnData.push({
								json: workspace,
								pairedItem: { item: i },
							});
						});
					}
				}

				if (resource === 'project') {
					if (operation === 'get') {
						const projectId = this.getNodeParameter('projectId', i, '', { extractValue: true }) as string;
						const result = await sdk.GetProjectById({ id: projectId });

						if (!result.desProjectById) {
							throw new NodeOperationError(
								this.getNode(),
								`Project with ID ${projectId} not found`,
							);
						}

						returnData.push({
							json: result.desProjectById,
							pairedItem: { item: i },
						});
					}

					if (operation === 'getSimplified') {
						const projectId = this.getNodeParameter('projectId', i, '', { extractValue: true }) as string;
						const result = await sdk.GetProjectById({ id: projectId });

						if (!result.desProjectById) {
							throw new NodeOperationError(
								this.getNode(),
								`Projekt mit ID ${projectId} nicht gefunden`,
							);
						}

						const project = result.desProjectById;
						returnData.push({
							json: {
								success: true,
								data: {
									id: project.id,
									projectId: project.projectId,
									name: project.name,
									description: project.description,
									projectType: project.projectType,
									createdAt: project.createdAt,
									updatedAt: project.updatedAt,
									url: project.url,
									workspaceUrl: project.workspaceUrl,
									variantCount: project.variantCount,
								},
								operation: 'getSimplified',
								timestamp: new Date().toISOString(),
							},
							pairedItem: { item: i },
						});
					}

					if (operation === 'getMany') {
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;
						const limit = this.getNodeParameter('limit', i, 50) as number;
						const workspaceUrl = credentials.workspaceUrl as string;

						const result = await sdk.GetProjects({
							workspaceUrl,
							first: returnAll ? undefined : limit,
						});

						if (!result.desProjects?.nodes) {
							throw new NodeOperationError(this.getNode(), 'No projects found');
						}

						result.desProjects.nodes.forEach((project) => {
							returnData.push({
								json: project,
								pairedItem: { item: i },
							});
						});
					}

					if (operation === 'getLatestCommit') {
						const projectId = this.getNodeParameter('projectId', i, '', { extractValue: true }) as string;
						const result = await sdk.GetLatestCommit({ projectId });

						if (!result.desProjectById?.latestRevision) {
							throw new NodeOperationError(
								this.getNode(),
								`No commits found for project ${projectId}`,
							);
						}

						returnData.push({
							json: {
								projectId: result.desProjectById.id,
								projectName: result.desProjectById.name,
								...result.desProjectById.latestRevision,
							},
							pairedItem: { item: i },
						});
					}

					if (operation === 'getCommitHistory') {
						const projectId = this.getNodeParameter('projectId', i, '', { extractValue: true }) as string;
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;
						const limit = this.getNodeParameter('limit', i, 50) as number;

						const result = await sdk.GetCommitHistory({
							projectId,
							first: returnAll ? undefined : limit,
						});

						if (!result.desProjectById?.revisions?.nodes) {
							throw new NodeOperationError(
								this.getNode(),
								`No commit history found for project ${projectId}`,
							);
						}

						result.desProjectById.revisions.nodes.forEach((commit) => {
							returnData.push({
								json: {
									projectId: result.desProjectById!.id,
									projectName: result.desProjectById!.name,
									...commit,
								},
								pairedItem: { item: i },
							});
						});
					}

					if (operation === 'updateParameters') {
						const projectId = this.getNodeParameter('projectId', i, '', { extractValue: true }) as string;
						const parametersData = this.getNodeParameter('parameters', i) as {
							parameter?: Array<{ name: string; value: string }>;
						};
						const replaceExisting = this.getNodeParameter('replaceExisting', i, false) as boolean;
						const parameters = parametersData.parameter ?? [];

						if (parameters.length === 0) {
							throw new NodeOperationError(this.getNode(), 'At least one parameter is required');
						}

						const result = await sdk.UpdateProjectParameters({
							projectId,
							parameters,
							replaceExisting,
						});

						if (result.desUpdateProjectParameters.errors?.length > 0) {
							throw new NodeOperationError(
								this.getNode(),
								`Failed to update parameters: ${result.desUpdateProjectParameters.errors.map((e) => e.message).join(', ')}`,
							);
						}

						returnData.push({
							json: {
								projectId: result.desUpdateProjectParameters.projectId,
								parametersUpdated: parameters.length,
								replaceExisting,
							},
							pairedItem: { item: i },
						});
					}
				}

				if (resource === 'export') {
					if (operation === 'downloadReleasePackage') {
						const releaseId = this.getNodeParameter('releaseId', i) as string;

						const result = await sdk.GetReleaseById({ id: releaseId });

						if (!result.desReleaseById) {
							throw new NodeOperationError(
								this.getNode(),
								`Release ${releaseId} not found`,
							);
						}

						const release = result.desReleaseById;
						returnData.push({
							json: {
								releaseId: release.releaseId,
								description: release.description,
								createdAt: release.createdAt,
								variants: release.variants,
							},
							pairedItem: { item: i },
						});
					}

					if (operation === 'exportProjectFiles') {
						const projectId = this.getNodeParameter('projectId', i, '', { extractValue: true }) as string;
						const exportType = this.getNodeParameter('exportType', i) as string;
						const variantName = this.getNodeParameter('variantName', i, '') as string;
						const revisionId = this.getNodeParameter('revisionId', i, '') as string;
						const fileName = this.getNodeParameter(
							'exportFileName',
							i,
							'',
						) as string;
						const timeout = this.getNodeParameter('timeout', i, 300) as number;
						const pollIntervalSec = this.getNodeParameter(
							'pollInterval',
							i,
							5,
						) as number;

						const input: Record<string, unknown> = {
							projectId,
							variantName: variantName || undefined,
							vcsRevisionId: revisionId || undefined,
						};

						const fileNameOpt = fileName ? { fileName } : {};

						switch (exportType) {
							case 'Gerber':
								input.exportGerber = fileNameOpt;
								break;
							case 'GerberX2':
								input.exportGerberX2 = fileNameOpt;
								break;
							case 'IDF':
								input.exportIdf = fileNameOpt;
								break;
							case 'NCDrill':
								input.exportNCDrill = fileNameOpt;
								break;
							case 'CustomOutJob': {
								const outJobContent = this.getNodeParameter(
									'outJobContent',
									i,
								) as string;
								input.exportAny = {
									outJobContent,
									...(fileName ? { fileName } : {}),
								};
								break;
							}
						}

						log('Altium365', `Creating export job: type=${exportType} project=${projectId}`);
						const createResult = await sdk.CreateProjectExportJob({
							input: input as any,
						});

						const errors = createResult.desCreateProjectExportJob.errors;
						if (errors?.length > 0) {
							throw new NodeOperationError(
								this.getNode(),
								`Export job creation failed: ${errors.map((e) => e.message).join(', ')}`,
							);
						}

						const jobId =
							createResult.desCreateProjectExportJob.projectExportJobId;
						if (!jobId) {
							throw new NodeOperationError(
								this.getNode(),
								'Export job creation returned no job ID',
							);
						}

						log('Altium365', `Polling export job ${jobId}...`);
						const jobResult = await pollJob(
							() => sdk.GetProjectExportJob({ projectExportJobId: jobId }),
							(r) => r.desProjectExportJob?.status === 'DONE',
							(r) => r.desProjectExportJob?.status === 'ERROR',
							(r) =>
								`Export job failed: ${r.desProjectExportJob?.reason ?? 'Unknown error'}`,
							pollIntervalSec * 1000,
							timeout * 1000,
						);

						log(
							'Altium365',
							`Export job complete: ${jobResult.desProjectExportJob?.downloadUrl}`,
						);
						returnData.push({
							json: {
								projectId,
								exportType,
								status: 'DONE',
								downloadUrl: jobResult.desProjectExportJob?.downloadUrl,
							},
							pairedItem: { item: i },
						});
					}

					if (operation === 'createManufacturePackage') {
						const projectId = this.getNodeParameter('projectId', i, '', { extractValue: true }) as string;
						const packageName = this.getNodeParameter('packageName', i) as string;
						const shareWithRaw = this.getNodeParameter(
							'shareWithEmails',
							i,
						) as string;
						const shareWith = shareWithRaw
							.split(',')
							.map((e) => e.trim())
							.filter(Boolean);
						const description = this.getNodeParameter(
							'packageDescription',
							i,
							'',
						) as string;
						const variantName = this.getNodeParameter(
							'variantName',
							i,
							'',
						) as string;
						const revisionId = this.getNodeParameter(
							'revisionId',
							i,
							'',
						) as string;
						const callbackUrl = this.getNodeParameter(
							'callbackUrl',
							i,
							'',
						) as string;
						const timeout = this.getNodeParameter('timeout', i, 300) as number;
						const pollIntervalSec = this.getNodeParameter(
							'pollInterval',
							i,
							5,
						) as number;

						log(
							'Altium365',
							`Creating manufacture package "${packageName}" for project ${projectId}${callbackUrl ? ' (async/webhook mode)' : ''}`,
						);
						const createResult = await sdk.CreateManufacturePackage({
							input: {
								projectId,
								name: packageName,
								shareWith,
								description: description || undefined,
								variantName: variantName || undefined,
								vcsRevisionId: revisionId || undefined,
								callbackUrl: callbackUrl || undefined,
							},
						});

						const errors = createResult.desCreateManufacturePackage.errors;
						if (errors?.length > 0) {
							throw new NodeOperationError(
								this.getNode(),
								`Manufacture package creation failed: ${errors.map((e) => e.message).join(', ')}`,
							);
						}

						const jobId = createResult.desCreateManufacturePackage.jobId;

						// If a callback URL was provided, return immediately - Nexar will POST
						// to the webhook when the package is ready.
						if (callbackUrl) {
							log('Altium365', `Manufacture package job ${jobId} started, callback registered`);
							returnData.push({
								json: { projectId, packageName, jobId, status: 'PENDING', callbackUrl },
								pairedItem: { item: i },
							});
							continue;
						}

						log('Altium365', `Polling manufacture package job ${jobId}...`);
						const jobResult = await pollJob(
							() => sdk.GetManufacturePackageJob({ id: jobId }),
							(r) =>
								r.desManufacturePackageCreationJob?.status === 'DONE',
							(r) =>
								r.desManufacturePackageCreationJob?.status === 'ERROR',
							(r) => {
								const errs =
									r.desManufacturePackageCreationJob?.payload?.errors;
								return `Manufacture package failed: ${errs?.map((e) => e.message).join(', ') ?? 'Unknown error'}`;
							},
							pollIntervalSec * 1000,
							timeout * 1000,
						);

						const packageId =
							jobResult.desManufacturePackageCreationJob?.payload?.packageId;

						if (!packageId) {
							throw new NodeOperationError(
								this.getNode(),
								'Manufacture package created but returned no package ID',
							);
						}

						// Look up the download URL via project releases
						const pkgResult = await sdk.GetProjectManufacturePackages({
							projectId,
						});
						const allPackages =
							pkgResult.desProjectById?.design?.releases?.nodes?.flatMap(
								(r) => r.manufacturePackages,
							) ?? [];
						const pkg = allPackages.find(
							(p) => p.manufacturePackageId === packageId,
						);

						log(
							'Altium365',
							`Manufacture package complete: packageId=${packageId} downloadUrl=${pkg?.downloadUrl ?? '(not found)'}`,
						);
						returnData.push({
							json: {
								projectId,
								packageName,
								packageId,
								status: 'DONE',
								downloadUrl: pkg?.downloadUrl ?? null,
							},
							pairedItem: { item: i },
						});
					}
				}
			} catch (error) {
				if (this.continueOnFail()) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					returnData.push({
						json: {
							success: false,
							error: {
								message: errorMessage,
								type: error instanceof Error ? error.constructor.name : 'UnknownError',
								timestamp: new Date().toISOString(),
								operation,
								resource,
							},
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
