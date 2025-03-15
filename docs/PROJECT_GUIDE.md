# Project Guide

## Config
- Tech Stack: Node.js, Express, pdfmake
- Dependencies:
  - jest (testing)
  - diff2html (diff visualization)
  - supertest (integration testing)

## Standards
- Code Style: ES6+ JavaScript
- Testing: Jest with 100% test coverage goal
- Documentation: Maintain CONTEXT_GUIDE and PROJECT_GUIDE
- Error Handling:
  - Validate all JSON inputs
  - Provide meaningful error messages
  - Implement fallback mechanisms
  - Ensure proper resource cleanup

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