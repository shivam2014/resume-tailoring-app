# Context Guide

## Project State
- Status: In progress (Phase 1 of LaTeX.js migration)
- Features:
  - LaTeX parsing via AST
  - Web worker implementation
  - Text extraction from LaTeX
- Issues:
  - Need to update server-side PDF generation

## Next Steps
1. Remove pdflatex dependency
2. Add HTML preview endpoint
3. Update PDF generation to use browser print

## Decisions
2025-03-14: Implemented AST-based LaTeX parsing
- Why: To replace regex-based parsing with more robust solution
- Impact: Improved accuracy and maintainability of LaTeX parsing