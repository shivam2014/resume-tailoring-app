# Project Guide

## Config
- Tech Stack: Node.js, Express, pdfmake, Mistral AI API
- Dependencies:
  - jest (testing)
  - diff2html (diff visualization)
  - supertest (integration testing)
  - axios (API requests)
  - dotenv (environment configuration)

## Standards
- Code Style: ES6+ JavaScript
- Testing: 
  - Jest with 100% test coverage goal
  - Proper test cleanup and teardown
  - Use `afterEach` and `afterAll` hooks to ensure resources are released
  - Add `--detectOpenHandles` flag to Jest config to identify resource leaks
  - Ensure all timers are properly cleared with `.unref()`
  - Mock external API dependencies to avoid authentication issues
- Documentation: Maintain CONTEXT_GUIDE and PROJECT_GUIDE
- Error Handling:
  - Validate all JSON inputs
  - Check for null/undefined values before access (especially for sessionId)
  - Provide meaningful error messages
  - Implement graceful fallbacks for API failures
  - Properly handle authentication errors with retry mechanisms
  - Log errors with appropriate context information
  - Ensure proper resource cleanup
  - Implement request timeouts and circuit breakers for external services

## Architecture
- Components:
  - LaTeX Worker: Handles AST parsing in background
    - Processes LaTeX commands and environments
    - Converts AST to plain text
  - Diff Utils: Manages text comparison and formatting
    - Section extraction
    - LaTeX text extraction
    - Diff visualization
  - Streaming Handler: Manages real-time data processing
    - Handles JSON parsing and validation
    - Manages event streams
    - Implements error recovery
  - Server: Handles PDF generation (using pdfmake) and API endpoints

## Process
- Build: npm run build
- Test: npm test
- Deploy: CI/CD pipeline with automated testing