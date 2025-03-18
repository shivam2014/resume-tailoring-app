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
  - Avoid function redeclaration - each function should be declared only once
  - Use function expressions with const for helper functions to prevent hoisting issues
  - When multiple functions have similar purposes, use different names or combine into a single function with parameters
  - For error handling functions, follow naming convention: `showError` for general errors, `showFieldError` for field-specific errors, etc.
  - Use consistent class names for styling - especially for error states (e.g., 'error-field')
  - Only apply validation error styling after user interaction, not on initial page load
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
  - Required field validation checklist:
    - sessionId: string (non-empty)
    - content: object with text property
    - requirements: object with messages array
    - jobDescription: string (non-empty)
    - apiKey: string (non-empty)
  - Messages array validation:
    - role: one of ["system", "user", "assistant"]
    - content: string (non-empty)
  - Check for null/undefined values before access
  - Use format-specific validation for different file types
  - Provide meaningful error messages with field names
  - Implement request validation middleware
  - Provide meaningful error messages
  - Implement graceful fallbacks for API failures
  - Properly handle authentication errors with retry mechanisms
  - Log errors with appropriate context information
  - Ensure proper resource cleanup
  - Implement request timeouts and circuit breakers for external services
- Form Validation:
  - Only show validation errors after user attempts to submit the form
  - Use specific CSS classes for invalid fields (e.g., 'error-field') rather than relying on pseudo-selectors
  - Clear validation errors when the form is resubmitted
  - Provide inline feedback near the relevant form fields
  - Include clear error messages explaining what's required
  - Ensure form validation styling is consistent across the application

## Architecture

### Streaming Module
- **Core**: Connection management, event streaming
  - ConnectionManager.js
- **Processors**: Content transformation
  - LatexProcessor.js (handles LaTeX validation and processing)
  - JsonProcessor.js (handles JSON parsing and validation)
- **Adapters**: AI service integrations
  - MistralAdapter.js (handles Mistral API communication)

### Helper Module
- **Core**: API client management
  - ApiClient.js
- **Utilities**: Common utilities
  - ErrorHandler.js
  - Logger.js

### Legacy Components
- LaTeX Worker: Handles AST parsing in background
- Diff Utils: Manages text comparison and formatting
- Server: Handles PDF generation (using pdfmake) and API endpoints

## Multi-Format Resume Processing

The application now supports multiple file formats for resume tailoring:

### Supported File Formats
- `.tex` - LaTeX documents (legacy format)
- `.json` - Structured JSON data
- `.md` - Markdown text
- `.txt` - Plain text
- `.pdf` - PDF documents (requires PDF.js integration)
- `.docx` - Word documents (requires additional libraries)

### Content Extraction Workflow
1. **File Upload**: User uploads resume file in any supported format
2. **Format Detection**: System detects file format based on extension
3. **Content Extraction**:
   - `.tex` files: Read as text, use AST parsing for structure
   - `.json` files: Parse JSON structure, extract relevant text fields
   - `.md` and `.txt` files: Read directly as plain text
   - `.pdf` and `.docx` files: Use specialized libraries for text extraction
4. **Content Validation**: Ensure extracted content is not empty
5. **API Processing**: Send extracted content to Mistral AI for analysis
6. **Result Generation**: Process API response and generate tailored results

### Format-Specific Considerations
- **JSON Format**: Should contain text in `content`, `text`, or `sections` fields
- **Markdown**: Special formatting is preserved for better analysis
- **PDF/DOCX**: These formats require additional libraries (PDF.js, mammoth.js)
  and currently display a helpful error message suggesting alternative formats

### Error Handling
- Validation errors for unsupported file types
- Format-specific extraction errors with clear messages
- Empty content detection and appropriate error messaging

## Process
- Build: npm run build
- Test: npm test
- Deploy: CI/CD pipeline with automated testing

## Testing Guide

### Test Configuration
- **Jest Configuration**: All Jest settings should be managed in `jest.config.js` only
  - Do not duplicate Jest settings in `package.json` or `.babelrc`
  - Use the existing projects structure for backend and frontend tests

### Adding New Tests
1. Determine test type:
   - **Backend tests**: Server, API, and data processing logic
   - **Frontend tests**: UI components, browser interactions, DOM manipulation

2. Place test files in the correct category:
   ```js
   // Backend tests (Node environment)
   - tests/server.test.js
   - tests/mistralHelper.test.js
   - tests/streamAnalyzeJob.test.js
   - tests/[your-backend-feature].test.js
   
   // Frontend tests (JSDOM environment)
   - tests/diffUtils.test.js
   - tests/streamingHandler.test.js
   - tests/formValidation.test.js   // Added new test file
   - tests/[your-frontend-feature].test.js
   ```

3. Update Jest configuration:
   - When adding a new test file that doesn't match existing patterns, add it to the appropriate project in `jest.config.js`:
   ```js
   projects: [
     {
       displayName: 'backend',
       testEnvironment: 'node',
       testMatch: [
         '**/tests/server.test.js',
         '**/tests/mistralHelper.test.js',
         '**/tests/streamAnalyzeJob.test.js',
         '**/tests/[your-new-backend-test].test.js'  // Add this line
       ]
     },
     {
       displayName: 'frontend',
       testEnvironment: 'jsdom',
       testMatch: [
         '**/tests/diffUtils.test.js',
         '**/tests/streamingHandler.test.js',
         '**/tests/[your-new-frontend-test].test.js'  // Add this line
       ],
       setupFilesAfterEnv: ['./tests/setup.js']
     }
   ]
   ```

### Module Pattern Best Practices
- **Class methods vs. standalone functions**:
  - Use the dual export pattern when testing is required:
    ```js
    // Class for application use
    export class MyClass {
      methodToTest() { /* implementation */ }
    }
    
    // Singleton instance for app components
    const instance = new MyClass();
    export default instance;
    
    // Standalone function for direct testing
    export function methodToTest() { /* same implementation */ }
    ```
  - Ensure validation logic is consistent between class methods and standalone functions
  - Document the relationship between different implementations in the same module

### Module Format Compatibility
- **For ESM and CommonJS interoperability:**
  - Use `.js` extension for imports within test files
  - Avoid mixing `require()` and `import` in the same file
  - Use the existing `moduleNameMapper` configuration in Jest 
  - Do NOT add additional Babel configurations outside of `babel.config.js`
  - When testing class methods, consider extracting standalone functions for easier testing
  - Ensure validation logic matches between ESM and CommonJS versions of the same functionality

### Common Issues & Solutions
1. **"Cannot use import statement outside a module" error**
   - Ensure the test file is included in the correct Jest project section
   - Check that babel-jest is correctly transforming the file

2. **"SyntaxError: Unexpected token 'export'" error**
   - Ensure the file is being transformed by Babel
   - Check that the transformIgnorePatterns is correctly configured

3. **"Error: Not supported" for ES modules**
   - Use the existing moduleNameMapper in jest.config.js
   - Don't modify Node.js native ESM behavior with flags

4. **Resource leaks in tests**
   - Always clean up resources in `afterEach` or `afterAll` hooks
   - Use `.unref()` on timers and close all streams
   - Add proper cleanup calls to MistralHelper instances

5. **Test can't find exported function**
   - Check if the function is properly exported (named export vs default export)
   - Ensure the function is directly importable (not just a class method)
   - Use the dual export pattern when both instance methods and direct function access are needed

6. **"Uncaught SyntaxError: redeclaration of function"**
   - Check for duplicate function declarations with the same name
   - Rename one of the duplicate functions to be more specific
   - Convert one function declaration to a function expression with const
   - Consider merging the functions if they serve similar purposes
   - For error handlers, use more specific naming like `showFormError`, `showApiError`, etc.

7. **Form validation errors showing on page load**
   - Only add error classes to form elements after form submission attempt
   - Use specific CSS classes (like 'error-field') rather than targeting all empty inputs
   - Remove validation styling when the form is resubmitted
   - Clear previous error messages before validating again

8. **"JSON parsing failed" errors in streaming API responses**
   - Implement JSON boundary detection with brace tracking (opening/closing braces)
   - Extract only the portion of the response that contains valid JSON
   - Apply multiple fallback strategies when standard parsing fails
   - Consider character-by-character parsing for very malformed responses
   - Log the first and last N characters of problematic JSON for debugging
   - For Mistral API streams, properly handle the [DONE] marker in various formats
   - Use JSON recovery techniques like property extraction and reconstruction

9. **Streaming API response handling**
   - Always validate stream objects before using them
   - Use TextDecoder for proper UTF-8 decoding
   - Process chunks as they arrive rather than waiting for complete response
   - Implement line buffering for proper event stream parsing
   - Check for specific patterns like 'data: [DONE]' to detect stream end
   - Add cleanup logic to prevent resource leaks
   - Implement retry mechanisms with proper backoff strategies
   - Provide clear error messages to distinguish between different failure modes

10. **Multi-format file handling**
    - Validate file extensions before attempting to process
    - Use appropriate file reading methods based on format (readAsText vs readAsArrayBuffer)
    - Implement format-specific content extraction functions
    - Handle binary formats with specialized libraries
    - Validate extracted content before sending to API
    - Provide clear error messages for unsupported or malformed file formats

### Running Individual Test Files
To run a specific test file without configuration issues:
```bash
npx jest tests/your-test-file.test.js --config=jest.config.js
```