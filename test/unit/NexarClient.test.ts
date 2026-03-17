import { NexarClient } from '../../shared/NexarClient';
import { mockCredentials, mockTokenResponse, mockExpiredTokenResponse } from '../fixtures/credentials';
import { createMockFetch, createSequentialMockFetch, wait } from '../helpers/testHelpers';

// Mock graphql-request
jest.mock('graphql-request');
// Mock the generated SDK - create mock inside factory to avoid hoisting issues
jest.mock('../../shared/generated/graphql', () => {
	const mockSdk = {
		GetWorkspaces: () => {},
		GetProjectById: () => {},
		GetProjects: () => {},
	};
	return {
		getSdk: () => mockSdk,
	};
});

describe('NexarClient', () => {
	let originalFetch: typeof global.fetch;

	beforeEach(() => {
		originalFetch = global.fetch;
		jest.clearAllMocks();

		// Setup default GraphQLClient mock
		const { GraphQLClient } = require('graphql-request');
		GraphQLClient.mockImplementation(() => ({
			setHeader: jest.fn(),
			request: jest.fn(),
		}));
	});

	afterEach(() => {
		global.fetch = originalFetch;
		jest.clearAllMocks();
	});

	describe('constructor', () => {
		it('should initialize with client credentials', () => {
			const client = new NexarClient(mockCredentials.clientId, mockCredentials.clientSecret);
			expect(client).toBeInstanceOf(NexarClient);
		});

		it('should create GraphQL client with correct endpoint and headers', () => {
			const { GraphQLClient } = require('graphql-request');
			new NexarClient(mockCredentials.clientId, mockCredentials.clientSecret);

			expect(GraphQLClient).toHaveBeenCalledWith('https://api.nexar.com/graphql', {
				headers: {
					'User-Agent': 'n8n-nodes-altium365/0.1.0',
				},
			});
		});
	});

	describe('token management', () => {
		it('should fetch token on first getSdk() call', async () => {
			const mockFetch = createMockFetch(mockTokenResponse);
			global.fetch = mockFetch;

			const client = new NexarClient(mockCredentials.clientId, mockCredentials.clientSecret);
			await client.getSdk();

			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(mockFetch).toHaveBeenCalledWith(
				'https://identity.nexar.com/connect/token',
				expect.objectContaining({
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
					},
				}),
			);

			const callBody = mockFetch.mock.calls[0][1].body;
			expect(callBody).toContain(`client_id=${mockCredentials.clientId}`);
			expect(callBody).toContain(`client_secret=${mockCredentials.clientSecret}`);
			expect(callBody).toContain('grant_type=client_credentials');
			expect(callBody).toContain('scope=design.domain');
		});

		it('should cache token and reuse it on subsequent calls', async () => {
			const mockFetch = createMockFetch(mockTokenResponse);
			global.fetch = mockFetch;

			const client = new NexarClient(mockCredentials.clientId, mockCredentials.clientSecret);

			await client.getSdk();
			await client.getSdk();
			await client.getSdk();

			// Should only fetch token once
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it('should refresh token when it expires', async () => {
			const { GraphQLClient } = require('graphql-request');
			const mockSetHeader = jest.fn();
			GraphQLClient.mockImplementation(() => ({
				setHeader: mockSetHeader,
			}));

			const newTokenResponse = {
				...mockTokenResponse,
				access_token: 'new-refreshed-token-xyz789',
			};

			const mockFetch = createSequentialMockFetch([
				{ data: mockExpiredTokenResponse },
				{ data: newTokenResponse },
			]);
			global.fetch = mockFetch;

			const client = new NexarClient(mockCredentials.clientId, mockCredentials.clientSecret);

			// First call fetches expired token
			await client.getSdk();
			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(mockSetHeader).toHaveBeenCalledWith(
				'Authorization',
				`Bearer ${mockExpiredTokenResponse.access_token}`,
			);

			// Wait to ensure token is expired
			await wait(10);

			// Second call should fetch new token
			await client.getSdk();
			expect(mockFetch).toHaveBeenCalledTimes(2);
			expect(mockSetHeader).toHaveBeenCalledWith(
				'Authorization',
				`Bearer ${newTokenResponse.access_token}`,
			);

			// Verify both tokens were different
			expect(mockExpiredTokenResponse.access_token).not.toBe(newTokenResponse.access_token);
		});

		it('should not refresh token before 5-minute buffer expires', async () => {
			const tokenWithLongExpiry = { ...mockTokenResponse, expires_in: 86400 }; // 24 hours
			const mockFetch = createMockFetch(tokenWithLongExpiry);
			global.fetch = mockFetch;

			const client = new NexarClient(mockCredentials.clientId, mockCredentials.clientSecret);
			await client.getSdk();

			// The token should still be valid now, so no new fetch should happen
			await client.getSdk();
			expect(mockFetch).toHaveBeenCalledTimes(1);

			// Verify by advancing time to just before the buffered expiry
			jest.useFakeTimers();
			// Token expires at: now + 86400s - 5min buffer
			// Advance to 6 minutes before original expiry = 1 minute before buffered expiry
			const sixMinutesBeforeOriginalExpiry = 86400 * 1000 - 6 * 60 * 1000;
			jest.advanceTimersByTime(sixMinutesBeforeOriginalExpiry);

			// Should still use cached token (1 minute left before expiry)
			await client.getSdk();
			expect(mockFetch).toHaveBeenCalledTimes(1);

			jest.useRealTimers();
		});

		it('should refresh token when 5-minute buffer threshold is reached', async () => {
			const { GraphQLClient } = require('graphql-request');
			const mockSetHeader = jest.fn();
			GraphQLClient.mockImplementation(() => ({
				setHeader: mockSetHeader,
			}));

			const initialToken = { ...mockTokenResponse, expires_in: 86400 }; // 24 hours
			const refreshedToken = {
				...mockTokenResponse,
				access_token: 'refreshed-token-after-buffer',
				expires_in: 86400,
			};

			const mockFetch = createSequentialMockFetch([
				{ data: initialToken },
				{ data: refreshedToken },
			]);
			global.fetch = mockFetch;

			const client = new NexarClient(mockCredentials.clientId, mockCredentials.clientSecret);

			// Fetch initial token
			await client.getSdk();
			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(mockSetHeader).toHaveBeenCalledWith('Authorization', `Bearer ${initialToken.access_token}`);

			// Advance time past the 5-minute buffer threshold
			jest.useFakeTimers();
			// Token buffered expiry: now + 86400s - 5min
			// Advance to 4 minutes before original expiry = 1 minute past buffered expiry
			const fourMinutesBeforeOriginalExpiry = 86400 * 1000 - 4 * 60 * 1000;
			jest.advanceTimersByTime(fourMinutesBeforeOriginalExpiry);

			// Should fetch new token
			await client.getSdk();
			expect(mockFetch).toHaveBeenCalledTimes(2);
			expect(mockSetHeader).toHaveBeenCalledWith(
				'Authorization',
				`Bearer ${refreshedToken.access_token}`,
			);

			// Verify tokens are different
			expect(initialToken.access_token).not.toBe(refreshedToken.access_token);

			jest.useRealTimers();
		});

		it('should set Authorization header on GraphQL client after token fetch', async () => {
			const { GraphQLClient } = require('graphql-request');
			const mockSetHeader = jest.fn();
			GraphQLClient.mockImplementation(() => ({
				setHeader: mockSetHeader,
			}));

			const mockFetch = createMockFetch(mockTokenResponse);
			global.fetch = mockFetch;

			const client = new NexarClient(mockCredentials.clientId, mockCredentials.clientSecret);
			await client.getSdk();

			expect(mockSetHeader).toHaveBeenCalledWith(
				'Authorization',
				`Bearer ${mockTokenResponse.access_token}`,
			);
		});

		it('should throw error when OAuth token request fails', async () => {
			const errorResponse = { error: 'invalid_client', error_description: 'Invalid credentials' };
			const mockFetch = createMockFetch(errorResponse, 401);
			global.fetch = mockFetch;

			const client = new NexarClient('bad-client-id', 'bad-secret');

			await expect(client.getSdk()).rejects.toThrow('OAuth token request failed');
		});
	});

	describe('getSdk()', () => {
		it('should return typed SDK after ensuring token is valid', async () => {
			const mockFetch = createMockFetch(mockTokenResponse);
			global.fetch = mockFetch;

			const client = new NexarClient(mockCredentials.clientId, mockCredentials.clientSecret);
			const sdk = await client.getSdk();

			expect(sdk).toBeDefined();
			expect(sdk).toHaveProperty('GetWorkspaces');
		});
	});

	describe('query()', () => {
		it('should execute raw GraphQL query with variables', async () => {
			const { GraphQLClient } = require('graphql-request');
			const mockRequest = jest.fn().mockResolvedValue({ data: 'test' });
			GraphQLClient.mockImplementation(() => ({
				setHeader: jest.fn(),
				request: mockRequest,
			}));

			const mockFetch = createMockFetch(mockTokenResponse);
			global.fetch = mockFetch;

			const client = new NexarClient(mockCredentials.clientId, mockCredentials.clientSecret);

			const testQuery = 'query Test($id: ID!) { test(id: $id) }';
			const testVariables = { id: '123' };

			const result = await client.query(testQuery, testVariables);

			expect(mockRequest).toHaveBeenCalledWith(testQuery, testVariables);
			expect(result).toEqual({ data: 'test' });
		});

		it('should ensure token is valid before executing query', async () => {
			const mockFetch = createMockFetch(mockTokenResponse);
			global.fetch = mockFetch;

			const client = new NexarClient(mockCredentials.clientId, mockCredentials.clientSecret);

			await client.query('{ test }');

			// Should have fetched token
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});
	});
});
