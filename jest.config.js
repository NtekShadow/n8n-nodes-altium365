module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/test', '<rootDir>/credentials', '<rootDir>/nodes', '<rootDir>/shared'],
	testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
	collectCoverageFrom: [
		'credentials/**/*.ts',
		'nodes/**/*.ts',
		'shared/**/*.ts',
		'!**/*.d.ts',
		'!**/node_modules/**',
		'!shared/generated/**',
	],
	coverageDirectory: 'coverage',
	coverageReporters: ['json-summary', 'lcov', 'html', 'text'],
	moduleFileExtensions: ['ts', 'js', 'json'],
	transform: {
		'^.+\\.ts$': [
			'ts-jest',
			{
				tsconfig: 'tsconfig.test.json',
			},
		],
	},
	setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
	clearMocks: true,
	resetMocks: true,
	restoreMocks: true,
};
