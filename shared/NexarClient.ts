import type { IExecuteFunctions, IPollFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { GraphQLClient } from 'graphql-request';
import { getSdk } from './generated/graphql';

type ExecutionContext = IExecuteFunctions | IPollFunctions;

export class NexarClient {
	private graphqlClient: GraphQLClient;
	private sdk: ReturnType<typeof getSdk>;
	private context: ExecutionContext;
	private credentialType: string;
	private apiUrl: string;

	private static readonly DEFAULT_GRAPHQL_ENDPOINT = 'https://api.nexar.com/graphql';

	/**
	 * Create a NexarClient that delegates all auth to n8n's OAuth2 credential system.
	 *
	 * For credentials extending oAuth2Api, n8n's httpRequestWithAuthentication
	 * automatically injects the Bearer token and handles refresh on 401.
	 */
	constructor(
		context: ExecutionContext,
		credentialType: string = 'altium365NexarApi',
		apiUrl?: string,
	) {
		this.context = context;
		this.credentialType = credentialType;
		this.apiUrl = apiUrl || NexarClient.DEFAULT_GRAPHQL_ENDPOINT;

		this.graphqlClient = new GraphQLClient(this.apiUrl, {
			fetch: async (url: string | URL | Request, options?: Record<string, any>) => {
				const urlString = typeof url === 'string' ? url : url.toString();
				const bodyPreview = options?.body
					? String(options.body).substring(0, 200)
					: '(no body)';
				console.log(`[Altium365] REQUEST ${urlString} body=${bodyPreview}`);

				const requestOptions: IHttpRequestOptions = {
					method: 'POST',
					url: urlString,
					headers: {
						'Content-Type': 'application/json',
						'User-Agent': 'n8n-nodes-altium365/0.5.0',
					},
					body: options?.body as string,
					json: false,
				};

				const startTime = Date.now();
				try {
					// n8n handles Bearer token injection and refresh automatically
					const responseBody =
						await this.context.helpers.httpRequestWithAuthentication.call(
							this.context,
							this.credentialType,
							requestOptions,
						);

					const elapsed = Date.now() - startTime;
					const bodyStr =
						typeof responseBody === 'string'
							? responseBody
							: JSON.stringify(responseBody);

					console.log(
						`[Altium365] RESPONSE (${elapsed}ms) preview=${bodyStr.substring(0, 300)}`,
					);

					return {
						ok: true,
						status: 200,
						statusText: 'OK',
						text: async () => bodyStr,
						json: async () =>
							typeof responseBody === 'string'
								? JSON.parse(responseBody)
								: responseBody,
						headers: new Headers({ 'content-type': 'application/json' }),
					} as Response;
				} catch (error) {
					const elapsed = Date.now() - startTime;
					const errorMessage = error instanceof Error ? error.message : String(error);
					console.error(
						`[Altium365] REQUEST FAILED (${elapsed}ms): ${errorMessage}`,
					);
					throw error;
				}
			},
		});

		this.sdk = getSdk(this.graphqlClient);
	}

	getSdk() {
		return this.sdk;
	}

	query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
		return this.graphqlClient.request<T>(query, variables);
	}
}
