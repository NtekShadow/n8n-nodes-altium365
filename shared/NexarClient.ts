import type { IExecuteFunctions, IPollFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { GraphQLClient } from 'graphql-request';
import { getSdk } from './generated/graphql';

type ExecutionContext = IExecuteFunctions | IPollFunctions;

export class NexarClient {
	private graphqlClient: GraphQLClient;
	private sdk: ReturnType<typeof getSdk>;
	private context: ExecutionContext;
	private credentialType: string;

	private static readonly GRAPHQL_ENDPOINT = 'https://api.nexar.com/graphql';

	/**
	 * Create a NexarClient using n8n's OAuth2 credential system
	 * @param context - n8n execution context (IExecuteFunctions or IPollFunctions)
	 * @param credentialType - The credential type name (e.g., 'altium365NexarApi')
	 */
	constructor(context: ExecutionContext, credentialType: string = 'altium365NexarApi') {
		this.context = context;
		this.credentialType = credentialType;

		console.log('[Altium365] NexarClient constructor called');
		console.log('[Altium365] Credential type:', credentialType);

		// Create a custom GraphQL client that uses n8n's OAuth2 request helper
		this.graphqlClient = new GraphQLClient(NexarClient.GRAPHQL_ENDPOINT, {
			headers: {
				'User-Agent': 'n8n-nodes-altium365/0.2.0',
			},
			// Override the request method to use n8n's OAuth2 helper
			fetch: async (url: string | URL | Request, options?: Record<string, any>) => {
				const urlString = typeof url === 'string' ? url : url.toString();
				const requestOptions: IHttpRequestOptions = {
					method: 'POST',
					url: urlString,
					headers: options?.headers as Record<string, string>,
					body: options?.body as string,
					json: false, // Body is already JSON stringified by graphql-request
					returnFullResponse: true, // Get status code and headers
				};

				console.log('[Altium365] Making GraphQL request to:', urlString);
				console.log('[Altium365] Using credential type:', this.credentialType);
				console.log('[Altium365] Request headers:', JSON.stringify(requestOptions.headers, null, 2));

				// Try to get credential data to verify OAuth tokens are present
				try {
					const credentials = await this.context.getCredentials(this.credentialType);
					console.log('[Altium365] Credential data keys:', Object.keys(credentials));
					console.log('[Altium365] Has oauthTokenData:', 'oauthTokenData' in credentials);
					if ('oauthTokenData' in credentials) {
						const tokenData = credentials.oauthTokenData as any;
						console.log('[Altium365] Token data keys:', Object.keys(tokenData));
						console.log('[Altium365] Has access_token:', 'access_token' in tokenData);
						console.log('[Altium365] Has refresh_token:', 'refresh_token' in tokenData);
						console.log('[Altium365] Token type:', tokenData.token_type);
						console.log('[Altium365] Granted scope:', tokenData.scope);
						console.log('[Altium365] Expires in:', tokenData.expires_in);

						// Show first/last 20 chars of access token to verify it exists
						if (tokenData.access_token) {
							const token = tokenData.access_token as string;
							console.log('[Altium365] Access token length:', token.length);
							console.log('[Altium365] Access token start:', token.substring(0, 20) + '...');
							console.log('[Altium365] Access token end:', '...' + token.substring(token.length - 20));

							// Try to decode JWT to see claims (don't verify signature, just decode)
							try {
								const parts = token.split('.');
								if (parts.length === 3) {
									const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
									console.log('[Altium365] JWT full payload:', JSON.stringify(payload, null, 2));
								}
							} catch (jwtError) {
								console.error('[Altium365] Could not decode JWT:', jwtError);
							}
						}
					}
				} catch (credError) {
					console.error('[Altium365] Error getting credentials:', credError);
				}

				try {
					// Use requestOAuth2 for OAuth2 credentials instead of requestWithAuthentication
					const response = await this.context.helpers.requestOAuth2.call(
						this.context,
						this.credentialType,
						requestOptions,
						{
							tokenType: 'Bearer',
						},
					);

					console.log('[Altium365] Request successful, status:', (response as any).statusCode || 200);

					// Log response headers to see if there are any hints
					if ((response as any).headers) {
						console.log('[Altium365] Response headers:', JSON.stringify((response as any).headers, null, 2));
					}

					// n8n returns { body, headers, statusCode, statusMessage }
					const statusCode = (response as any).statusCode || 200;
					const body = (response as any).body || response;

					// Return a Response-like object for graphql-request
					return {
						ok: statusCode >= 200 && statusCode < 300,
						status: statusCode,
						statusText: (response as any).statusMessage || 'OK',
						text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
						json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
						headers: new Headers((response as any).headers || {}),
					} as Response;
				} catch (error) {
					// Handle authentication errors or network errors
					const errorMessage = error instanceof Error ? error.message : String(error);
					const errorStack = error instanceof Error ? error.stack : '';

					console.error('[Altium365] NexarClient fetch error:', errorMessage);
					console.error('[Altium365] Error stack:', errorStack);
					console.error('[Altium365] Request URL:', urlString);
					console.error('[Altium365] Credential type:', this.credentialType);

					// Try to extract more details from the error object
					if (error && typeof error === 'object') {
						// Log the full error object (excluding stack to reduce noise)
						const errorDetails = { ...error };
						delete (errorDetails as any).stack;
						console.error('[Altium365] Full error object:', JSON.stringify(errorDetails, null, 2));

						// Check for common error properties
						if ('response' in error) {
							console.error('[Altium365] Error response:', JSON.stringify((error as any).response, null, 2));
						}
						if ('body' in error) {
							console.error('[Altium365] Error body:', JSON.stringify((error as any).body, null, 2));
						}
						if ('statusCode' in error) {
							console.error('[Altium365] Error status code:', (error as any).statusCode);
						}
					}

					// Throw the error so graphql-request can handle it properly
					throw error;
				}
			},
		});

		this.sdk = getSdk(this.graphqlClient);
	}

	/**
	 * Get the fully typed GraphQL SDK
	 */
	getSdk() {
		return this.sdk;
	}

	/**
	 * Execute a raw GraphQL query (for custom queries not in the SDK)
	 */
	query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
		return this.graphqlClient.request<T>(query, variables);
	}
}
