# Context Guide

## Project State
- Status: Phase 1.2 complete
- Features:
  - HTML preview endpoint implementation
  - Error handling for HTML generation
  - Integration tests for HTML preview
  - PDF generation using pdfmake
- Issues: None

## Next Steps
1. Add HTML preview endpoint

## Decisions
2025-03-14: Removed pdflatex and LaTeX.js dependencies
- Why: To migrate to pdfmake for better maintainability and cross-platform compatibility
- Impact: Simplified PDF generation process, removed external dependencies

2025-03-14: Implemented AST-based LaTeX parsing
- Why: To replace regex-based parsing with more robust solution
- Impact: Improved accuracy and maintainability of LaTeX parsing