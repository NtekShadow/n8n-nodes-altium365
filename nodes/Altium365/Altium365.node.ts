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

const TOOL_DESCRIPTION = `Interacts with Altium 365 via the Nexar API for project management, exports, and workspace operations.

Use JSON with "resource" and "operation" fields plus any optional parameters for the desired action.

WORKSPACE OPERATIONS:
• getAll: Returns all accessible workspaces. No parameters required. Example: {"resource":"workspace","operation":"getAll"}

PROJECT OPERATIONS:
• get: Get a single project by ID. Required: projectId. Example: {"resource":"project","operation":"get","projectId":"proj-123"}
• getSimplified: Get project with simplified response (id, name, description, etc). Required: projectId. Example: {"resource":"project","operation":"getSimplified","projectId":"proj-123"}
• getMany: List projects in workspace. Returns up to 100 projects by default. If the project you're looking for is not in the list, the results may be truncated — set a higher 'limit' (e.g., 500) or use 'returnAll':true to fetch all projects. Optional: returnAll (bool, default false), limit (number, default 100). Example: {"resource":"project","operation":"getMany","limit":500}
• getLatestCommit: Get the latest commit of a project. Required: projectId. Example: {"resource":"project","operation":"getLatestCommit","projectId":"proj-123"}
• getCommitHistory: Get commit history. Required: projectId. Optional: returnAll (bool), limit (number). Example: {"resource":"project","operation":"getCommitHistory","projectId":"proj-123","limit":20}
• updateParameters: Update project parameters. Required: projectId, parameters (array of {name, value} objects). Optional: replaceExisting (bool, default false). Example: {"resource":"project","operation":"updateParameters","projectId":"proj-123","parameters":[{"name":"param1","value":"val1"}],"replaceExisting":false}

EXPORT OPERATIONS:
• downloadReleasePackage: Get release details with variants. Required: releaseId. Example: {"resource":"export","operation":"downloadReleasePackage","releaseId":"rel-456"}
• exportProjectFiles: Create and poll export job. Required: projectId, exportType. Optional: variantName, revisionId, exportFileName, outJobContent, timeout (sec, default 300), pollInterval (sec, default 5). ExportType can be: Gerber, GerberX2, IDF, NCDrill, CustomOutJob. Example: {"resource":"export","operation":"exportProjectFiles","projectId":"proj-123","exportType":"Gerber","timeout":300,"pollInterval":5}
• createManufacturePackage: Create manufacture package. Required: projectId, packageName, shareWithEmails (comma-separated). Optional: packageDescription, variantName, revisionId, callbackUrl (for async webhook mode), timeout (default 300), pollInterval (default 5). Example: {"resource":"export","operation":"createManufacturePackage","projectId":"proj-123","packageName":"PCB Package","shareWithEmails":"user@example.com"}`;

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
		subtitle: 'AI Agent Tool',
		description: TOOL_DESCRIPTION,
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
				displayName: 'Tool Description',
				name: 'descriptionMode',
				type: 'options',
				options: [
					{
						name: 'Set automatically',
						value: 'auto',
					},
					{
						name: 'Set manually',
						value: 'manual',
					},
				],
				default: 'auto',
				description: 'Choose whether to use the built-in tool description or enter a custom description manually.',
			},
			{
				displayName: 'Description (manual)',
				name: 'toolDescription',
				type: 'string',
				default: '',
				typeOptions: {
					rows: 5,
				},
				displayOptions: {
					show: {
						descriptionMode: ['manual'],
					},
				},
				description: 'Enter a custom tool description when manual mode is selected.',
			},
			{
				displayName: 'Agent Payload',
				name: 'agentPayload',
				type: 'json',
				default: '',
				typeOptions: {
					rows: 10,
				},
				description: 'Provide a JSON object with "resource", "operation" and any additional required parameters.',
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

		const agentPayload = this.getNodeParameter('agentPayload', 0);
		let resource: string;
		let operation: string;
		let params: Record<string, unknown> = {};

		if (agentPayload === undefined || agentPayload === null || (typeof agentPayload === 'string' && !agentPayload.trim())) {
			throw new NodeOperationError(this.getNode(), 'Agent Payload is required and must be valid JSON');
		}

		if (typeof agentPayload === 'string') {
			try {
				params = JSON.parse(agentPayload);
			} catch (error) {
				throw new NodeOperationError(this.getNode(), `Invalid JSON in agentPayload: ${(error as Error).message}`);
			}
		} else if (typeof agentPayload === 'object') {
			params = agentPayload as Record<string, unknown>;
		}

		if (!params || typeof params !== 'object' || Array.isArray(params)) {
			throw new NodeOperationError(this.getNode(), 'Agent Payload must be a JSON object');
		}
		resource = params.resource as string;
		operation = params.operation as string;
		if (!resource || !operation) {
			throw new NodeOperationError(this.getNode(), 'Agent Payload must include resource and operation');
		}

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
						const projectId = params.projectId as string;
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
						const projectId = params.projectId as string;
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
						const returnAll = (params.returnAll as boolean) ?? false;
						const limit = (params.limit as number) ?? 100;
						const workspaceUrl = credentials.workspaceUrl as string;

						if (returnAll) {
							// Fetch all projects with pagination
							let allProjects: any[] = [];
							let hasNextPage = true;
							let after: string | undefined = undefined;

							while (hasNextPage) {
								const result = await sdk.GetProjects({
									workspaceUrl,
									first: 50,
									after,
								});

								if (result.desProjects?.nodes) {
									allProjects.push(...result.desProjects.nodes);
								}

								hasNextPage = result.desProjects?.pageInfo.hasNextPage ?? false;
								after = result.desProjects?.pageInfo.endCursor ?? undefined;
							}

							allProjects.forEach((project) => {
								returnData.push({
									json: project,
									pairedItem: { item: i },
								});
							});
						} else {
							const result = await sdk.GetProjects({
								workspaceUrl,
								first: limit,
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
					}

					if (operation === 'getLatestCommit') {
						const projectId = params.projectId as string;
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
						const projectId = params.projectId as string;
						const returnAll = params.returnAll as boolean;
						const limit = params.limit as number;

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
						const projectId = params.projectId as string;
						const parametersData = params.parameters as {
							parameter?: Array<{ name: string; value: string }>;
						};
						const replaceExisting = params.replaceExisting as boolean;
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
						const releaseId = params.releaseId as string;

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
						const projectId = params.projectId as string;
						const exportType = params.exportType as string;
						const variantName = params.variantName as string;
						const revisionId = params.revisionId as string;
						const fileName = params.exportFileName as string;
						const timeout = params.timeout as number;
						const pollIntervalSec = params.pollInterval as number;
						const outJobContent = params.outJobContent as string;

						const input: any = {
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
						const projectId = params.projectId as string;
						const packageName = params.packageName as string;
						const shareWithRaw = params.shareWithEmails as string;
						const shareWith = shareWithRaw
							.split(',')
							.map((e: string) => e.trim())
							.filter(Boolean);
						const description = params.packageDescription as string;
						const variantName = params.variantName as string;
						const revisionId = params.revisionId as string;
						const callbackUrl = params.callbackUrl as string;
						const timeout = params.timeout as number;
						const pollIntervalSec = params.pollInterval as number;

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
