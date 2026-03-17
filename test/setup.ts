// Test setup file - runs before all tests

// Set test environment variables
process.env.NODE_ENV = 'test';

// Increase timeout for tests that might make API calls
jest.setTimeout(10000);
