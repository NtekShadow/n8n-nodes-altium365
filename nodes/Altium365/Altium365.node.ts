import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
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
		description: 'Interact with Altium 365 via Nexar API',
		defaults: {
			name: 'Altium 365',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'altium365NexarApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Export',
						value: 'export',
					},
					{
						name: 'Project',
						value: 'project',
					},
					{
						name: 'Workspace',
						value: 'workspace',
					},
				],
				default: 'project',
			},

			// ==================== Project operations ====================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['project'],
					},
				},
				options: [
					{
						name: 'Get',
						value: 'get',
						description: 'Get a project by ID',
						action: 'Get a project',
					},
					{
						name: 'Get Many',
						value: 'getMany',
						description: 'Get many projects',
						action: 'Get many projects',
					},
					{
						name: 'Get Latest Commit',
						value: 'getLatestCommit',
						description: 'Get the latest commit for a project',
						action: 'Get latest commit',
					},
					{
						name: 'Get Commit History',
						value: 'getCommitHistory',
						description: 'Get commit history for a project',
						action: 'Get commit history',
					},
					{
						name: 'Update Parameters',
						value: 'updateParameters',
						description: 'Update project parameters',
						action: 'Update project parameters',
					},
				],
				default: 'get',
			},

			// ==================== Workspace operations ====================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['workspace'],
					},
				},
				options: [
					{
						name: 'Get All',
						value: 'getAll',
						description: 'Get all workspaces',
						action: 'Get all workspaces',
					},
				],
				default: 'getAll',
			},

			// ==================== Export operations ====================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['export'],
					},
				},
				options: [
					{
						name: 'Download Release Package',
						value: 'downloadReleasePackage',
						description: 'Get download URLs for a release variant',
						action: 'Download a release package',
					},
					{
						name: 'Export Project Files',
						value: 'exportProjectFiles',
						description:
							'Export project files (Gerber, GerberX2, IDF, NCDrill, or custom OutJob)',
						action: 'Export project files',
					},
					{
						name: 'Create Manufacture Package',
						value: 'createManufacturePackage',
						description: 'Create and download a manufacture package',
						action: 'Create a manufacture package',
					},
				],
				default: 'exportProjectFiles',
			},

			// ==================== Shared fields ====================

			// Project ID (used by project + export operations)
			{
				displayName: 'Project Name or ID',
				name: 'projectId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getProjects',
				},
				required: true,
				displayOptions: {
					show: {
						resource: ['project', 'export'],
						operation: [
							'get',
							'getLatestCommit',
							'getCommitHistory',
							'updateParameters',
							'exportProjectFiles',
							'createManufacturePackage',
						],
					},
				},
				default: '',
				description:
					'Select a project or enter the full grid ID. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},

			// Limit field
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['project'],
						operation: ['getMany', 'getCommitHistory'],
					},
				},
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				description: 'Max number of results to return',
			},

			// Return all toggle
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				displayOptions: {
					show: {
						resource: ['project'],
						operation: ['getMany', 'getCommitHistory'],
					},
				},
				default: false,
				description: 'Whether to return all results or only up to a given limit',
			},

			// ==================== Export: Download Release Package ====================

			{
				displayName: 'Release Name or ID',
				name: 'releaseId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getReleases',
					loadOptionsDependsOn: ['projectId'],
				},
				required: true,
				displayOptions: {
					show: {
						resource: ['export'],
						operation: ['downloadReleasePackage'],
					},
				},
				default: '',
				description:
					'Select a release or enter the full grid ID. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},

			// ==================== Export: Export Project Files ====================

			{
				displayName: 'Export Type',
				name: 'exportType',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						resource: ['export'],
						operation: ['exportProjectFiles'],
					},
				},
				options: [
					{ name: 'Gerber', value: 'Gerber' },
					{ name: 'Gerber X2', value: 'GerberX2' },
					{ name: 'IDF', value: 'IDF' },
					{ name: 'NC Drill', value: 'NCDrill' },
					{ name: 'Custom OutJob', value: 'CustomOutJob' },
				],
				default: 'Gerber',
				description: 'The type of project export to create',
			},
			{
				displayName: 'OutJob Content',
				name: 'outJobContent',
				type: 'string',
				typeOptions: {
					rows: 10,
				},
				required: true,
				displayOptions: {
					show: {
						resource: ['export'],
						operation: ['exportProjectFiles'],
						exportType: ['CustomOutJob'],
					},
				},
				default: '',
				description: 'The content of an Altium Designer OutJob file',
			},

			// ==================== Export: Create Manufacture Package ====================

			{
				displayName: 'Package Name',
				name: 'packageName',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['export'],
						operation: ['createManufacturePackage'],
					},
				},
				default: '',
				description: 'The name for the manufacture package',
			},
			{
				displayName: 'Share With (Emails)',
				name: 'shareWithEmails',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['export'],
						operation: ['createManufacturePackage'],
					},
				},
				default: '',
				description: 'Comma-separated email addresses of manufacturers to share with',
			},
			{
				displayName: 'Package Description',
				name: 'packageDescription',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['export'],
						operation: ['createManufacturePackage'],
					},
				},
				default: '',
				description: 'Optional description for the package',
			},
			{
				displayName: 'Callback URL',
				name: 'callbackUrl',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['export'],
						operation: ['createManufacturePackage'],
					},
				},
				default: '',
				description:
					'Optional webhook URL. When provided, Nexar will POST the result here when the package is ready and the node returns immediately with the job ID instead of waiting. Use an n8n Webhook Trigger node URL to continue the workflow asynchronously.',
			},

			// ==================== Export: Shared optional fields ====================

			{
				displayName: 'Variant Name or ID',
				name: 'variantName',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getVariants',
					loadOptionsDependsOn: ['projectId'],
				},
				displayOptions: {
					show: {
						resource: ['export'],
						operation: ['exportProjectFiles', 'createManufacturePackage'],
					},
				},
				default: '',
				description:
					'Select a design variant, or leave empty for the default. Choose from the list, or specify a name using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Revision',
				name: 'revisionId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getRevisions',
					loadOptionsDependsOn: ['projectId'],
				},
				displayOptions: {
					show: {
						resource: ['export'],
						operation: ['exportProjectFiles', 'createManufacturePackage'],
					},
				},
				default: '',
				description:
					'Select a specific commit, or leave empty for the latest. Choose from the list, or specify a revision ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'File Name',
				name: 'exportFileName',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['export'],
						operation: ['exportProjectFiles'],
					},
				},
				default: '',
				description: 'Optional output file name (e.g. "MyExport.zip")',
			},

			// ==================== Export: Async job settings ====================

			{
				displayName: 'Timeout (Seconds)',
				name: 'timeout',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['export'],
						operation: ['exportProjectFiles', 'createManufacturePackage'],
					},
				},
				typeOptions: {
					minValue: 30,
				},
				default: 300,
				description: 'Maximum time to wait for the job to complete (default 5 minutes)',
			},
			{
				displayName: 'Poll Interval (Seconds)',
				name: 'pollInterval',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['export'],
						operation: ['exportProjectFiles', 'createManufacturePackage'],
					},
				},
				typeOptions: {
					minValue: 1,
					maxValue: 30,
				},
				default: 5,
				description: 'How often to check the job status',
			},
		],
	};

	methods = {
		loadOptions: {
			async getProjects(
				this: ILoadOptionsFunctions,
			): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials('altium365NexarApi');
				const apiUrl = credentials.apiEndpointUrl as string;
				const workspaceUrl = credentials.workspaceUrl as string;
				const client = new NexarClient(this, 'altium365NexarApi', apiUrl);
				const sdk = client.getSdk();

				const options: INodePropertyOptions[] = [];
				let after: string | undefined;

				do {
					const result = await sdk.GetProjects({
						workspaceUrl,
						first: 100,
						after,
					});

					if (!result.desProjects?.nodes) break;

					for (const project of result.desProjects.nodes) {
						options.push({
							name: project.name || project.id,
							value: project.id,
						});
					}

					if (result.desProjects.pageInfo.hasNextPage) {
						after = result.desProjects.pageInfo.endCursor ?? undefined;
					} else {
						break;
					}
				} while (after);

				options.sort((a, b) => a.name.localeCompare(b.name));
				return options;
			},

			async getReleases(
				this: ILoadOptionsFunctions,
			): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials('altium365NexarApi');
				const apiUrl = credentials.apiEndpointUrl as string;
				const projectId = this.getCurrentNodeParameter('projectId') as string;

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
				const projectId = this.getCurrentNodeParameter('projectId') as string;

				if (!projectId) return [];

				const client = new NexarClient(this, 'altium365NexarApi', apiUrl);
				const sdk = client.getSdk();
				const result = await sdk.GetProjectVariants({ projectId });

				const variants = result.desProjectById?.design?.variants ?? [];
				return variants.map((v) => ({ name: v.name, value: v.name }));
			},

			async getRevisions(
				this: ILoadOptionsFunctions,
			): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials('altium365NexarApi');
				const apiUrl = credentials.apiEndpointUrl as string;
				const projectId = this.getCurrentNodeParameter('projectId') as string;

				if (!projectId) return [];

				const client = new NexarClient(this, 'altium365NexarApi', apiUrl);
				const sdk = client.getSdk();
				const result = await sdk.GetCommitHistory({ projectId, first: 50 });

				const commits = result.desProjectById?.revisions?.nodes ?? [];
				return commits.map((c) => {
					const shortHash = c.revisionId.substring(0, 7);
					const date = new Date(c.createdAt).toLocaleDateString();
					const msg = c.message.length > 60 ? c.message.substring(0, 57) + '...' : c.message;
					return {
						name: `${shortHash} - ${msg} (${date})`,
						value: c.revisionId,
					};
				});
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
						const projectId = this.getNodeParameter('projectId', i) as string;
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
						const projectId = this.getNodeParameter('projectId', i) as string;
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
						const projectId = this.getNodeParameter('projectId', i) as string;
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
						throw new NodeOperationError(
							this.getNode(),
							'Update Parameters operation not yet implemented',
						);
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
						const projectId = this.getNodeParameter('projectId', i) as string;
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
						const projectId = this.getNodeParameter('projectId', i) as string;
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
							error: errorMessage,
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
