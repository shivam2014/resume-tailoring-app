# Resume Tailoring Application Specification

## 1. Overview
A web application that uses Mistral AI to analyze job descriptions and automatically tailor LaTeX resumes. The application follows a client-server architecture with Node.js backend and vanilla JavaScript frontend, featuring real-time streaming responses and enhanced error handling.

## 2. Core Components

### 2.1 Backend (`src/`)

#### server.js
- Express.js server implementation
- Handles file uploads via multer
- Routes:
  - `GET /`: Serves main application page
  - `POST /stream-analyze`: Initiates streaming job analysis
  - `GET /stream-analyze-events`: Streams analysis results
  - `POST /stream-tailor`: Initiates resume tailoring
  - `GET /stream-tailor-events`: Streams tailoring results
  - `POST /generate-pdf`: Generates PDF from modified LaTeX
- Features:
  - Server-Sent Events (SSE) streaming
  - Session-based streaming management
  - LaTeX compilation with pdflatex
  - Automatic file cleanup (24-hour retention)
  - Error handling with LaTeX log parsing
  - Port fallback mechanism (starts at 3001)

#### mistralHelper.js
- Mistral AI API integration class
- Key methods:
  - `analyzeJobDescription()`: Extracts requirements from job posting
  - `tailorResume()`: Modifies resume content to match job
  - `streamAnalyzeJobDescription()`: Streams analysis results in real-time with improved JSON handling
  - `streamTailorResume()`: Streams tailored resume content in real-time
  - `latexToPlainText()`: Converts LaTeX to readable text for processing
- Advanced streaming features:
  - Robust JSON structure tracking
  - Smart bracket and string state management
  - Automatic JSON repair and cleanup
  - Real-time chunk processing
  - Error resilient streaming
  - Improved JSON state handling:
    - Smart brace detection and repair
    - Empty buffer validation
    - Content normalization
    - Smart quotes replacement
    - Whitespace normalization
    - Detailed logging for JSON fixes
  - Enhanced error detection:
    - Empty buffer detection
    - Invalid JSON structure handling
    - Malformed chunk detection
    - Processing validation logging
- Custom prompt management for:
  - Job analysis
  - Resume tailoring
- Structured response format for job requirements
- Response cleaning and normalization:
  - Smart quotes replacement
  - Property name quoting
  - Array element formatting
  - Whitespace normalization
  - JSON structure validation and repair

### 2.2 Frontend (`public/`)

#### Main Application (main.js)
- Core functionality:
  - File upload handling
  - Form submission
  - Resume diff visualization
  - PDF generation
  - State management
- Features:
  - API key persistence
  - Custom prompt management
  - Real-time streaming updates
  - LaTeX editing capability
  - Progress indication
  - Error display

#### Diff Utilities (diffUtils.js)
- Handles resume comparison visualization
- Features:
  - Side-by-side diff view with section-based organization
  - Advanced section-based text extraction from LaTeX
  - Section-specific change highlighting
  - Visual differentiation between sections
  - Word-level change tracking
  - LaTeX syntax highlighting
  - Text extraction from LaTeX with structured output
  - Human-readable mode with enhanced readability
  - Job analysis formatting
- Section-based processing:
  - Name
  - Contact Information
  - Summary
  - Skills
  - Experience
  - Education
  - Professional Development & Languages
  - Publications
- Change visualization:
  - Color-coded section backgrounds
  - Inline change highlighting
  - Addition/removal/modification indicators
  - Word-level diff tracking
  - Change type identification

#### Streaming Handler (streamingHandler.js)
- Manages real-time streaming responses from the API
- Features:
  - EventSource connection management
  - Chunk processing
  - Status updates
  - Error handling
  - Connection cleanup
  - Multiple stream types support
  - Automatic reconnection
  - Stream interruption recovery

#### UI Utilities (util.js)
- Manages collapsible sections
- DOM mutation observer
- Event handling
- Dynamic initialization

### 2.3 Frontend UI (`views/index.html`)
Single page application with sections:
1. Resume upload form
2. Job description input
3. Mistral AI configuration
4. Requirements analysis display
5. Resume comparison view
6. PDF generation options
7. Processing log
8. Streaming status indicators

### 2.4 Styling (`public/css/main.css`)
- Responsive design
- CSS variables for theming
- Component styles:
  - Cards
  - Forms
  - Buttons
  - Enhanced section-based diff view
  - Section-specific styling
  - Change highlighting
  - Collapsibles
  - Log area
  - Streaming indicators
  - Progress displays
- Diff view enhancements:
  - Section-specific background colors
  - Change type indicators
  - Improved readability
  - Better spacing and organization
  - Visual hierarchy for sections

## 3. Key Features

### 3.1 Resume Processing
1. LaTeX file upload
2. Job description analysis with structured output:
   - Category-based organization (technical skills, soft skills, etc.)
   - Empty category handling with placeholders
   - Real-time streaming of analysis results
   - Visual formatting with section headers and bullet points
3. Content optimization
4. Enhanced section-based diff visualization:
   - Structured content organization
   - Section-specific styling
   - Change highlighting by type
   - Word-level diff tracking
5. PDF generation

### 3.2 AI Integration
- Job requirement extraction with enhanced reliability and formatting:
  ```json
  {
    "technicalSkills": ["skill1", "skill2"],
    "softSkills": ["skill1", "skill2"],
    "experience": ["req1", "req2"],
    "education": ["req1", "req2"],
    "keyResponsibilities": ["resp1", "resp2"],
    "preferredQualifications": ["qual1", "qual2"],
    "industryKnowledge": ["knowledge1", "knowledge2"],
    "toolsAndPlatforms": ["tool1", "tool2"]
  }
  ```
- Requirements display features:
  - Category headers with consistent styling
  - Bullet points for individual items
  - Empty category handling with "None specified" message
  - Color-coded sections for better readability
  - Responsive layout adaptation
- Resume tailoring rules:
  - Maintain LaTeX structure
  - No new content addition
  - Emphasis on relevant skills
  - Format preservation
- Real-time streaming responses with:
  - Server-Sent Events (SSE)
  - Intelligent JSON structure tracking
  - Automatic error recovery
  - Chunk-based processing
  - String state management
  - Response normalization

### 3.3 File Management
- Upload directory: `/uploads`
- Cleanup after 24 hours
- Supported formats: `.tex`
- PDF generation with error handling

### 3.4 Error Handling
- LaTeX compilation errors
- API errors with detailed messages
- File system errors
- User input validation
- Streaming response error handling:
  - Connection failures
  - JSON parsing errors
  - Stream interruptions
  - Session timeouts
  - Automatic recovery
  - User feedback

## 4. Dependencies

### 4.1 Backend
```json
{
  "axios": "^1.6.7",
  "cors": "^2.8.5",
  "express": "^4.17.1",
  "multer": "^1.4.5-lts.1",
  "dotenv": "^16.0.3"
}
```

### 4.2 Frontend
```json
{
  "diff": "^7.0.0",
  "diff2html": "^3.4.51"
}
```

### 4.3 System Requirements
- Node.js v14+
- LaTeX installation (pdflatex)
- Mistral AI API key

## 5. Configuration

### 5.1 Environment Variables
```
MISTRAL_API_KEY=your_mistral_api_key_here
```

### 5.2 Default Prompts
1. Analysis Prompt:
   - Extracts structured requirements
   - Maintains terminology
   - Categories key qualifications

2. Tailoring Prompt:
   - Preserves LaTeX structure
   - Emphasizes matching skills
   - Reorganizes content

## 6. Data Flow

### 6.1 Resume Upload Process
1. User uploads .tex file
2. Backend validates file
3. Streaming session is created
4. Mistral AI analyzes job description
   - Real-time streaming to UI
   - JSON structure validation
   - Error handling
5. Resume content is optimized
   - Real-time streaming to UI
   - LaTeX structure preservation
6. Diff view is generated
7. User can edit changes
8. PDF is generated

### 6.2 State Management
- Session storage:
  - Streaming connections
  - Analysis results
  - Modified content
  - Error states
- Local storage for:
  - API key
  - Custom prompts
  - UI preferences
- Memory management:
  - Automatic session cleanup
  - Connection termination
  - Resource release

## 7. Security Measures

### 7.1 File Upload
- Extension validation
- Size limits
- Automatic cleanup
- Secure file naming
- Session-based access

### 7.2 API Security
- Key validation
- CORS configuration
- Error handling
- Rate limiting (TODO)
- Session management

## 8. Performance Optimizations

### 8.1 Frontend
- Lazy loading diff2html
- DOM mutation observer
- Debounced events
- Cached API key
- Enhanced section-based diff visualization:
  - Structured content extraction
  - Section-specific processing
  - Word-level change tracking
  - Visual differentiation
  - Change type indicators
- Real-time content streaming with:
  - Robust error handling
  - Enhanced JSON structure validation:
    - Automatic brace detection and repair
    - Smart quotes normalization
    - Empty buffer validation
    - Whitespace cleanup
  - Chunk-based updates with validation
  - Stream interruption recovery
  - Connection management
  - Memory optimization
  - Detailed processing logs

### 8.2 Backend
- Automatic cleanup
  - Port fallback
  - Error recovery
  - Memory management
  - Enhanced stream processing:
    - Smart JSON parsing
    - Structure validation
    - Automatic repair
    - Context tracking
    - Response normalization
    - Session cleanup
    - Resource management

## 9. Template Information

### 9.1 Resume Template Support
- LaTeX-based
- Standardized sections:
  - Header
  - Summary
  - Skills
  - Experience
  - Education
  - Additional sections

### 9.2 Formatting Rules
- Margin control
- Font management
- Spacing optimization
- Section styling
- Bullet point formatting

## 10. Future Enhancements

### 10.1 Planned Features
- Multiple resume templates
- Batch processing
- User accounts
- Resume history
- Advanced streaming features:
  - Bi-directional communication
  - Progress tracking
  - Cancel/pause support

### 10.2 Technical Improvements
- Redis caching
- Queue system
- Load balancing
- Advanced customization
- WebSocket integration
- Session persistence

> Note: This specification provides a comprehensive overview of the codebase structure and functionality, allowing developers to understand the system without examining every file. The actual implementation details can be found in the respective source files.