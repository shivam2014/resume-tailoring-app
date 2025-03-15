# Context Guide

## Project State
- Status: Phase 3 (Validation) in progress
- Features:
  - HTML preview endpoint implementation
  - Error handling for HTML generation
  - Integration tests for HTML preview
  - PDF generation using pdfmake
  - AST-based LaTeX parsing
  - AST-to-legacy format adapter
  - Robust LaTeX text extraction
  - Section extraction with AST parsing
  - JSON parsing with validation
  - Comprehensive error handling
  - Resource leak prevention
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

2025-03-15: Enhanced JSON parsing and error handling
- Why: To improve reliability of streaming data processing
- Impact: Better error recovery and fallback mechanisms

2025-03-15: Fixed resource leaks in test suite
- Why: To ensure proper cleanup of resources during testing
- Impact: More reliable test execution and reduced memory usage