/** @type {import('jest').Config} */
export default {
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
    '^.+\\.mjs$': 'babel-jest'
  },
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./tests/setup.js'],
  moduleFileExtensions: ['js', 'mjs', 'cjs', 'jsx', 'json'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(diff|diff2html)/)'
  ],
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    'https://cdn\\.jsdelivr\\.net/npm/diff@5\\.1\\.0/\\+esm': 'diff'
  },
  verbose: true,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/**/*.js',
    'public/js/**/*.js',
    '!**/node_modules/**'
  ],
  testTimeout: 10000,
  // Use different test environments for frontend and backend tests
  projects: [
    {
      displayName: 'backend',
      testEnvironment: 'node',
      testMatch: [
        '**/tests/server.test.js',
        '**/tests/mistralHelper.test.js'
        // Removed duplicate streamAnalyzeJob.test.js
      ]
    },
    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      testMatch: [
        '**/tests/diffUtils.test.js',
        '**/tests/streamingHandler.test.js',
        '**/tests/formValidation.test.js',
        '**/tests/latexComparison.test.js'  // Added LaTeX comparison test
        // Removed duplicate streamAnalyzeJob.test.js
      ],
      setupFilesAfterEnv: ['./tests/setup.js']
    }
  ]
}