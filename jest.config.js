/** @type {import('jest').Config} */
export default {
  transform: {
    '^.+\\.jsx?$': 'babel-jest'
  },
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['./tests/setup.js'],
  moduleFileExtensions: ['js', 'mjs', 'cjs', 'jsx', 'json'],
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(diff|diff2html)/)'
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
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
  // Use different test environments for frontend and backend tests
  projects: [
    {
      displayName: 'backend',
      testEnvironment: 'node',
      testMatch: [
        '**/tests/server.test.js',
        '**/tests/mistralHelper.test.js'
      ]
    },
    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      testMatch: [
        '**/tests/diffUtils.test.js',
        '**/tests/streamingHandler.test.js'
      ],
      setupFilesAfterEnv: ['./tests/setup.js']
    }
  ]
}