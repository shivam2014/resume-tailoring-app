# Resume Tailoring Application Architecture

## System Overview

The Resume Tailoring Application is a web-based system that uses AI to automatically tailor LaTeX resumes based on job descriptions. The application leverages Mistral AI for intelligent content analysis and modification while maintaining proper LaTeX structure.

## Architecture Components

### Frontend Architecture

#### Core Components
1. **User Interface Layer** (`views/index.html`)
   - Single page application design
   - Responsive layout using custom CSS
   - Form-based interface for resume and job description submission

2. **JavaScript Modules**
   - **main.js**: Core application logic and event handling
   - **diffUtils.js**: LaTeX text processing and diff visualization
   - **util.js**: Utility functions and UI helpers

#### Key Features
- Real-time diff view with side-by-side comparison
- Toggle between raw LaTeX and human-readable text
- Interactive LaTeX editor with syntax highlighting
- Error handling with LaTeX compilation feedback
- Collapsible sections for advanced options

### Backend Architecture

#### Core Components
1. **Express Server** (`src/server.js`)
   - RESTful API endpoints
   - File upload handling
   - PDF generation service
   - Static file serving

2. **Mistral AI Integration** (`src/mistralHelper.js`)
   - Job description analysis
   - Resume content optimization
   - Custom prompt management

3. **LaTeX Processing System**
   - PDF compilation service
   - Error extraction and handling
   - Temporary file management

### Data Flow

1. **Resume Upload Flow**
   ```
   Client -> File Upload -> Server Storage -> Mistral Analysis -> Content Optimization -> Client Display
   ```

2. **PDF Generation Flow**
   ```
   Modified Content -> LaTeX Compilation -> PDF Generation -> File Storage -> Download URL -> Client
   ```

## Technical Stack

### Frontend
- Native JavaScript (ES6+)
- CSS3 with CSS Variables
- HTML5
- diff2html for diff visualization
- Custom LaTeX text processing

### Backend
- Node.js
- Express.js
- Mistral AI API
- LaTeX (pdflatex)
- File system management

### Development Tools
- npm for package management
- Environment variables for configuration
- Git for version control

## Security Measures

1. **File Upload Security**
   - File type validation
   - Automatic file cleanup
   - Unique filename generation

2. **API Security**
   - CORS configuration
   - Input validation
   - Error handling

3. **System Security**
   - Environment variable protection
   - Temporary file management
   - Rate limiting (TODO)

## Performance Optimizations

1. **Frontend Optimizations**
   - Lazy loading of diff visualization
   - Efficient DOM updates
   - Debounced events
   - Cached API key and prompts

2. **Backend Optimizations**
   - Automatic file cleanup
   - Efficient LaTeX compilation
   - Response streaming
   - Memory management

## Future Considerations

1. **Scalability Improvements**
   - Redis for caching
   - Queue system for PDF generation
   - Load balancing

2. **Feature Enhancements**
   - Multiple resume template support
   - Batch processing
   - Advanced customization options
   - User accounts and history