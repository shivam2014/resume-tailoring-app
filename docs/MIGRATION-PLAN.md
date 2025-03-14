# PDF Generation Migration Plan

## Phase 1 - Core Parser Implementation

### 1.1 Client-Side Setup
```mermaid
sequenceDiagram
    participant Client
    participant LaTeX.js
    Client->>LaTeX.js: Load WebWorker
    LaTeX.js->>Client: AST Structure
    Client->>DiffUtils: Render Comparison
```

**Tasks:**
- [x] Install LaTeX.js: `npm install latex.js`
- [x] Create web worker (`public/js/latexWorker.js`)
- [x] Replace regex parsing in `extractTextFromLatex()`

**Test After:**
```bash
npm test tests/diffUtils.test.js -- -t "LaTeX parsing"
# Expected: 3 failing tests until AST implementation
```

### 1.2 Server-Side Adjustments
**Tasks:**
- [x] Remove pdflatex dependency from `server.js`
- [x] Add HTML endpoint (`/get-preview`)
- [x] Update PDF generation to use LaTeX.js

**Test After:**
```bash
npm test tests/server.test.js -- -t "PDF"
# Expected: Update tests to validate HTML->PDF flow
```

## Phase 2 - Essential Features

### 2.1 Core Functionality Preservation ✓
```mermaid
flowchart TD
    A[Original LaTeX] --> B(LaTeX.js Parser)
    B --> C[AST]
    C --> D{Diff Utils}
    D -->|Match| E[Existing Tests]
    D -->|No Match| F[Update Logic]
```

**Tasks:**
- [x] Implement AST-to-legacy format adapter
- [x] Maintain section comparison logic
- [x] Preserve CSS class names for diffs
- [x] Fix LaTeX text extraction

**Test After:**
```bash
npm run test:regression -- --updateSnapshot
```

## Phase 3 - Validation [Completed]

### 3.1 Testing Strategy
1. After each task completion:
```bash
npm test -- --findRelatedTests path/to/modified/file.js
```
2. Full validation:
```bash
npm test && npm run lint
```

**Results:**
- All validation tests passed
- Resource leaks fixed
- JSON parsing errors handled
- Test coverage improved

## Maintenance Plan
```bash
# Daily checks
npm run test:watch -- --changedSince main

# Weekly full validation
npm test && npm run lint