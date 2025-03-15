# Context Guide

## Project State
- Status: Phase 2.1 completed
- Features:
  - HTML preview endpoint implementation
  - Error handling for HTML generation
  - Integration tests for HTML preview
  - PDF generation using pdfmake
  - AST-based LaTeX parsing
  - AST-to-legacy format adapter
  - Robust LaTeX text extraction
  - Section extraction with AST parsing
- Issues: None

## Next Steps
1. Maintain section comparison logic
2. Preserve CSS class names for diffs

## Decisions
2025-03-14: Removed pdflatex and LaTeX.js dependencies
- Why: To migrate to pdfmake for better maintainability and cross-platform compatibility
- Impact: Simplified PDF generation process, removed external dependencies

2025-03-14: Implemented AST-based LaTeX parsing
- Why: To replace regex-based parsing with more robust solution
- Impact: Improved accuracy and maintainability of LaTeX parsing