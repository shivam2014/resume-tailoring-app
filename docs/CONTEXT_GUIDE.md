# Context Guide

## Project State
- Status: Phase 1.2 complete
- Features:
  - LaTeX parsing via AST
  - Web worker implementation
  - Text extraction from LaTeX
  - PDF generation using LaTeX.js
- Issues: None

## Next Steps
1. Add HTML preview endpoint

## Decisions
2025-03-14: Removed pdflatex dependency
- Why: To migrate to LaTeX.js for better maintainability and cross-platform compatibility
- Impact: Simplified PDF generation process, removed external dependency

2025-03-14: Implemented AST-based LaTeX parsing
- Why: To replace regex-based parsing with more robust solution
- Impact: Improved accuracy and maintainability of LaTeX parsing