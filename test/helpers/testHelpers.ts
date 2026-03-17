// Test helper utilities

import { mockCredentials, mockTokenResponse } from '../fixtures/credentials';

/**
 * Mock fetch implementation for testing HTTP requests
 */
export function createMockFetch(response: unknown, status = 200): jest.Mock {
	return jest.fn().mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		json: async () => response,
		text: async () => JSON.stringify(response),
	});
}

/**
 * Create a mock fetch that returns different responses on subsequent calls
 */
export function createSequentialMockFetch(responses: Array<{ data: unknown; status?: number }>): jest.Mock {
	const mockFetch = jest.fn();

	responses.forEach((response, _index) => {
		const status = response.status ?? 200;
		mockFetch.mockResolvedValueOnce({
			ok: status >= 200 && status < 300,
			status,
			json: async () => response.data,
			text: async () => JSON.stringify(response.data),
		});
	});

	return mockFetch;
}

/**
 * Mock the global fetch for OAuth token requests
 */
export function mockOAuthTokenFetch(tokenResponse = mockTokenResponse): jest.Mock {
	const mockFetch = createMockFetch(tokenResponse);
	global.fetch = mockFetch;
	return mockFetch;
}

/**
 * Mock the GraphQL client request method
 */
export function createMockGraphQLClient(responses: Record<string, unknown>) {
	return {
		request: jest.fn((query: string, _variables?: unknown) => {
			// Try to match query name from responses
			for (const [key, value] of Object.entries(responses)) {
				if (query.includes(key)) {
					return Promise.resolve(value);
				}
			}
			return Promise.reject(new Error('No mock response found for query'));
		}),
	};
}

/**
 * Wait for a specific amount of time (useful for testing timeouts/delays)
 */
export function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Advance timers and flush promises
 */
export async function advanceTimersAndFlush(ms: number): Promise<void> {
	jest.advanceTimersByTime(ms);
	await Promise.resolve(); // Flush promise queue
}

/**
 * Create a mock n8n execution context
 */
export function createMockExecutionContext(credentials: unknown = mockCredentials) {
	return {
		getCredentials: jest.fn().mockResolvedValue(credentials),
		getNodeParameter: jest.fn(),
		getInputData: jest.fn().mockReturnValue([{ json: {} }]),
		continueOnFail: jest.fn().mockReturnValue(false),
		helpers: {
			requestOAuth2: jest.fn(),
		},
	};
}

/**
 * Create a mock workflow static data for trigger nodes
 */
export function createMockWorkflowStaticData(initialData: Record<string, unknown> = {}) {
	const data = { ...initialData };
	return new Proxy(data, {
		get(target, prop) {
			return target[prop as string];
		},
		set(target, prop, value) {
			target[prop as string] = value;
			return true;
		},
	});
}
