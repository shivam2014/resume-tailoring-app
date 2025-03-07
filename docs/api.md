# API Documentation

## Endpoints

### 1. Upload and Analyze Resume
`POST /upload`

Uploads a LaTeX resume file and analyzes it against a job description using Mistral AI.

#### Request
- **Content-Type**: multipart/form-data
- **Body**:
  ```
  resumeFile: File (.tex)
  jobDescription: string
  apiKey: string
  analyzePrompt?: string
  tailorPrompt?: string
  ```

#### Response
```json
{
  "message": "Resume successfully tailored",
  "jobRequirements": {
    "technicalSkills": string[],
    "softSkills": string[],
    "experience": string[],
    "education": string[],
    "keyResponsibilities": string[],
    "preferredQualifications": string[],
    "industryKnowledge": string[],
    "toolsAndPlatforms": string[]
  },
  "modifiedContent": string
}
```

#### Error Response
```json
{
  "error": string,
  "details": string,
  "stack": string (development only)
}
```

### 2. Generate PDF
`POST /generate-pdf`

Generates a PDF from modified LaTeX content.

#### Request
- **Content-Type**: application/json
- **Body**:
  ```json
  {
    "content": "string (LaTeX content)"
  }
  ```

#### Response
```json
{
  "message": "PDF generated successfully",
  "pdfPath": string,
  "latexLog": string
}
```

#### Error Response
```json
{
  "error": string,
  "details": string,
  "latexLog": string
}
```

## Mistral AI Integration

### Job Description Analysis
The application uses Mistral AI to analyze job descriptions with the following structure:

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

### Resume Tailoring
The Mistral AI service follows these guidelines when tailoring resumes:
1. Maintains LaTeX structure and commands
2. Does not add new content
3. Reorganizes and emphasizes relevant content
4. Updates terminology to match job requirements
5. Preserves formatting and comments

## Error Handling

### Common Error Types
1. **File Upload Errors**
   - Invalid file type
   - File too large
   - Upload failed

2. **API Key Errors**
   - Missing API key
   - Invalid API key
   - API quota exceeded

3. **LaTeX Compilation Errors**
   - Syntax errors
   - Missing packages
   - Compilation timeout

4. **PDF Generation Errors**
   - File system errors
   - Permission issues
   - Resource constraints

### Error Response Format
All errors follow this format:
```json
{
  "error": "Error type or message",
  "details": "Detailed error description",
  "latexLog": "LaTeX compilation log (if applicable)"
}
```