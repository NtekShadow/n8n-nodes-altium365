// Mock credential fixtures for testing

export const mockCredentials = {
	clientId: 'test-client-id-12345',
	clientSecret: 'test-client-secret-67890',
};

export const mockTokenResponse = {
	access_token: 'mock-access-token-abcdef123456',
	token_type: 'Bearer',
	expires_in: 86400, // 24 hours in seconds
};

export const mockExpiredTokenResponse = {
	access_token: 'mock-expired-token',
	token_type: 'Bearer',
	expires_in: 0, // Already expired
};
