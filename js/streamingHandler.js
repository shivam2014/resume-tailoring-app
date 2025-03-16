// ...existing code...

/**
 * Extract content from different file types
 * @param {File} file - The uploaded file
 * @returns {Promise<string>} - The extracted content
 */
export function extractFileContent(file) {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    fileReader.onload = async (event) => {
      try {
        const content = event.target.result;
        
        switch (fileExtension) {
          case '.tex':
            // Process LaTeX files
            resolve(content); // Already in text format
            break;
          case '.json':
            // Extract text from JSON structure
            try {
              const jsonData = JSON.parse(content);
              // Assuming JSON has a text or content field, or combine relevant fields
              const extractedText = extractTextFromJSON(jsonData);
              resolve(extractedText);
            } catch (jsonError) {
              reject(new Error('Invalid JSON format: ' + jsonError.message));
            }
            break;
          case '.txt':
          case '.md':
            // Plain text formats need no special handling
            resolve(content);
            break;
          case '.pdf':
            // For PDFs, we need to use PDF.js or similar library for extraction
            // This is a placeholder - actual implementation would use a PDF parsing library
            reject(new Error('PDF extraction requires PDF.js integration. Please use another format.'));
            break;
          case '.docx':
            // For DOCX, we would need mammoth.js or similar
            // This is a placeholder - actual implementation would use a DOCX parsing library
            reject(new Error('DOCX extraction requires additional libraries. Please use another format.'));
            break;
          default:
            reject(new Error(`Unsupported file format: ${fileExtension}`));
        }
      } catch (error) {
        reject(new Error(`Error extracting content from ${file.name}: ${error.message}`));
      }
    };
    
    fileReader.onerror = () => reject(new Error('Error reading file'));
    
    // Read file as text for most formats
    if (['.tex', '.json', '.txt', '.md'].includes(fileExtension)) {
      fileReader.readAsText(file);
    } else {
      // For binary formats like PDF/DOCX, we would use readAsArrayBuffer
      // This is a placeholder for future implementation
      fileReader.readAsArrayBuffer(file);
    }
  });
}

/**
 * Extract text from JSON structure
 * @param {Object} jsonData - Parsed JSON data
 * @returns {string} - Extracted text
 */
export function extractTextFromJSON(jsonData) {
  // Handle various JSON structures
  if (typeof jsonData === 'string') {
    return jsonData;
  }
  
  if (jsonData.content || jsonData.text) {
    return jsonData.content || jsonData.text;
  }
  
  if (jsonData.sections) {
    // If JSON has sections, concatenate their content
    return jsonData.sections.map(section => {
      if (typeof section === 'string') return section;
      return section.content || section.text || '';
    }).join('\n\n');
  }
  
  // Fall back to stringifying the JSON for processing
  return JSON.stringify(jsonData, null, 2);
}

/**
 * Tailor a resume based on a job description
 * @param {File} resumeFile - Resume file to tailor
 * @param {string} jobDescription - Job description to tailor resume against
 * @param {Object} options - Optional parameters
 * @returns {Promise<Object>} - API response data
 */
export function streamTailorResume(resumeFile, jobDescription, options = {}) {
  return new Promise((resolve, reject) => {
    if (!resumeFile || !jobDescription) {
      reject(new Error('Missing required parameters: resumeFile and jobDescription are required'));
      return;
    }
    
    // Multi-format support - REPLACE the .tex check at line 563
    const allowedExtensions = ['.tex', '.json', '.md', '.txt'];
    const fileExtension = '.' + resumeFile.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
      reject(new Error(`Unsupported file format. Allowed formats: ${allowedExtensions.join(', ')}`));
      return;
    }
    
    // Use our new content extraction function instead of the original FileReader
    extractFileContent(resumeFile)
      .then(extractedContent => {
        // Validate extracted content
        if (!extractedContent || extractedContent.trim() === '') {
          reject(new Error('Extracted resume content is empty'));
          return;
        }
        
        // Continue with API communication using the extracted content
        const formData = new FormData();
        formData.append('resumeContent', extractedContent);
        formData.append('jobDescription', jobDescription);
        
        // Add optional parameters
        if (options.apiKey) {
          formData.append('apiKey', options.apiKey);
        }
        
        if (options.tailorPrompt) {
          formData.append('tailorPrompt', options.tailorPrompt);
        }
        
        // Call the API endpoint
        fetch('/tailor-resume', {
          method: 'POST',
          body: formData
        })
        .then(response => {
          if (!response.ok) {
            return response.json().then(errorData => {
              throw new Error(errorData.error || 'Error tailoring resume');
            });
          }
          return response.json();
        })
        .then(data => {
          resolve(data);
        })
        .catch(error => {
          reject(error);
        });
      })
      .catch(error => {
        reject(error);
      });
  });
}

// Make functions available on window object for testing
if (typeof window !== 'undefined') {
  window.extractFileContent = extractFileContent;
  window.extractTextFromJSON = extractTextFromJSON;
  window.streamTailorResume = streamTailorResume;
}

// Class-based API (existing code)
export class StreamHandler {
  constructor() {
    // ...existing code...
    
    // Expose utility functions for testing
    this.extractFileContent = extractFileContent;
    this.extractTextFromJSON = extractTextFromJSON;
    // Create a specific version for file handling to differentiate from the class method
    this.fileStreamTailorResume = streamTailorResume;
  }
  
  // Use the exported functions inside methods
  async streamTailorResume(data, callbacks) {
    // ...existing code...
    // This method would use the exported streamTailorResume function
  }
  
  // ...existing code...
}

// Create singleton instance
const streamingHandler = new StreamHandler();
export default streamingHandler;

// ...existing code...