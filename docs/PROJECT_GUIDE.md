# Project Guide

## Config
- Tech Stack: Node.js, Express, LaTeX.js
- Dependencies:
  - latex.js
  - jest (testing)
  - diff2html (diff visualization)

## Standards
- Code Style: ES6+ JavaScript
- Testing: Jest with 100% test coverage goal
- Documentation: Maintain CONTEXT_GUIDE and PROJECT_GUIDE

## Architecture
- Components:
  - LaTeX Worker: Handles AST parsing in background
  - Diff Utils: Manages text comparison and formatting
  - Server: Handles PDF generation (using LaTeX.js) and API endpoints

## Process
- Build: npm run build
- Test: npm test
- Deploy: CI/CD pipeline with automated testing