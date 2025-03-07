# Development Guide

## Project Setup

### Prerequisites
1. Node.js (v14 or higher)
2. LaTeX Installation (TeX Live or MiKTeX)
3. npm or yarn package manager
4. Git
5. Mistral AI API key

### Initial Setup
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and add your Mistral AI API key
4. Verify LaTeX installation:
   ```bash
   pdflatex --version
   ```

## Project Structure

```
resume-tailoring-app/
├── docs/               # Documentation
├── public/            # Static files
│   ├── css/          # Stylesheets
│   └── js/           # Client-side JavaScript
├── src/              # Server-side source code
├── static/           # Additional static assets
├── uploads/          # Temporary file storage
├── views/            # HTML templates
└── package.json      # Project configuration
```

## Key Components

### Frontend Components

1. **Main Application** (`public/js/main.js`)
   - Form handling
   - Resume analysis
   - PDF generation
   - UI state management

2. **Diff Utilities** (`public/js/diffUtils.js`)
   - LaTeX text processing
   - Diff visualization
   - Syntax highlighting

3. **UI Utilities** (`public/js/util.js`)
   - Collapsible sections
   - DOM manipulation
   - Event handling

### Backend Components

1. **Server** (`src/server.js`)
   - Express configuration
   - Route handling
   - File management
   - Error handling

2. **Mistral Helper** (`src/mistralHelper.js`)
   - AI integration
   - Prompt management
   - Response processing

## Development Workflow

### Running the Application

1. **Development Mode**
   ```bash
   npm run dev
   ```
   - Auto-reload enabled
   - Debug logging
   - Stack traces

2. **Production Mode**
   ```bash
   npm start
   ```
   - Optimized performance
   - Minimal logging
   - Error handling

### Making Changes

1. **Frontend Changes**
   - Modify files in `public/js/` or `public/css/`
   - Changes reflected immediately in dev mode
   - Test in multiple browsers

2. **Backend Changes**
   - Modify files in `src/`
   - Server restarts automatically in dev mode
   - Test API endpoints

3. **LaTeX Integration**
   - Test with various LaTeX templates
   - Verify PDF generation
   - Check error handling

### Testing

1. **Manual Testing Checklist**
   - File upload functionality
   - Job description analysis
   - Resume tailoring
   - PDF generation
   - Error scenarios

2. **API Testing**
   - Use Postman or similar tools
   - Test all endpoints
   - Verify responses
   - Check error handling

3. **Browser Testing**
   - Test in major browsers
   - Check responsive design
   - Verify LaTeX syntax highlighting

## Best Practices

### Code Style

1. **JavaScript**
   - Use ES6+ features
   - Async/await for promises
   - Proper error handling
   - Consistent naming

2. **CSS**
   - Use CSS variables
   - Mobile-first approach
   - BEM naming convention
   - Minimize specificity

3. **LaTeX Processing**
   - Preserve document structure
   - Handle special characters
   - Maintain formatting
   - Clean up temporary files

### Error Handling

1. **Frontend**
   - User-friendly messages
   - Detailed logging
   - Graceful fallbacks
   - State recovery

2. **Backend**
   - Structured error responses
   - LaTeX error parsing
   - File cleanup
   - Security validations

### Performance

1. **Frontend Optimization**
   - Lazy loading
   - Event debouncing
   - Resource caching
   - Memory management

2. **Backend Optimization**
   - File size limits
   - Request timeouts
   - Efficient processing
   - Resource cleanup

## Troubleshooting

### Common Issues

1. **LaTeX Compilation**
   - Missing packages
   - Syntax errors
   - Path issues
   - Permission problems

2. **API Integration**
   - Rate limiting
   - Authentication
   - Response formatting
   - Timeout handling

3. **File Processing**
   - Upload failures
   - Storage issues
   - Cleanup errors
   - Permission denied

### Debugging Tools

1. **Browser Tools**
   - Console logging
   - Network monitoring
   - Performance profiling
   - Error tracking

2. **Server Tools**
   - Log files
   - Process monitoring
   - Memory usage
   - Error stacks