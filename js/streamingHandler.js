// ...existing code...

/**
 * Extract content from different file types
 * Supported formats:
 * - .tex  - LaTeX documents
 * - .json - Structured JSON data
 * - .md   - Markdown text
 * - .txt  - Plain text
 *
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
            const allowedFormats = ['.tex', '.json', '.md', '.txt'];
            reject(new Error(`Unsupported file format. Allowed formats: ${allowedFormats.join(', ')}`));
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
    
    const allowedExtensions = ['.tex', '.json', '.md', '.txt'];
    const fileExtension = '.' + resumeFile.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
      reject(new Error("Unsupported file format. Allowed formats: .tex, .json, .md, .txt"));
      return;
    }
    
    // Extract content from the file based on its format
    extractFileContent(resumeFile)
      .then(extractedContent => {
        // Validate extracted content
        if (!extractedContent || extractedContent.trim() === '') {
          reject(new Error('Extracted resume content is empty'));
          return;
        }
        
        // Prepare form data with original file and metadata
        const formData = new FormData();
        formData.append('resume', resumeFile);  // Send actual File object
        // Format as per Mistral API requirements
        const messages = [
          {
            role: "system",
            content: "Please analyze these job requirements and extract key skills and qualifications."
          },
          {
            role: "user",
            content: jobDescription
          }
        ];
        formData.append('requirements', JSON.stringify({ messages }));
        formData.append('format', fileExtension);
        
        // Add optional parameters
        if (options.apiKey) {
          formData.append('apiKey', options.apiKey);
        }
        
        if (options.tailorPrompt) {
          formData.append('tailorPrompt', options.tailorPrompt);
        }

        console.log(`Sending ${fileExtension} format resume for tailoring`);
        
        // Use an async IIFE to handle the fetch operation
        (async () => {
          try {
            const response = await fetch('/tailor-resume', {
              method: 'POST',
              body: formData
            });

            if (!response.ok) {
              const errorData = await response.json();
              const formatMsg = ` for ${fileExtension} format`;
              if (errorData.error) {
                throw new Error(`${errorData.error}${formatMsg}`);
              }
              throw new Error(`Error processing resume${formatMsg}`);
            }

            const data = await response.json();
            resolve(data);
          } catch (error) {
            reject(error);
          }
        })();
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
  
  // Stream the resume tailoring process
  async streamTailorResume(data, callbacks) {
    try {
      if (!data.resumeFile || !data.jobDescription || !data.apiKey) {
        throw new Error('Missing required parameters: resumeFile, jobDescription, and apiKey are required');
      }

      // Extract file content and format
      const fileExtension = '.' + data.resumeFile.name.split('.').pop().toLowerCase();
      const extractedContent = await this.extractFileContent(data.resumeFile);

      // Create session with format information
      const formData = new FormData();
      formData.append('resume', data.resumeFile);  // Match server upload field name
      // Format as per Mistral API requirements
      const messages = [
        {
          role: "system",
          content: "Please analyze these job requirements and extract key skills and qualifications."
        },
        {
          role: "user",
          content: data.jobDescription
        }
      ];
      formData.append('requirements', JSON.stringify({ messages }));
      formData.append('format', fileExtension);
      formData.append('apiKey', data.apiKey);

      if (data.tailorPrompt) {
        formData.append('tailorPrompt', data.tailorPrompt);
      }

      // Handle callbacks
      if (callbacks?.onStart) {
        callbacks.onStart({ format: fileExtension });
      }

      const response = await fetch('/stream-tailor', {
        method: 'POST',
        body: formData
      });

      if (callbacks?.onComplete) {
        callbacks.onComplete(response);
      }

      return response;
    } catch (error) {
      // Add format-specific context to error messages
      const fileExtension = data?.resumeFile?.name ? '.' + data.resumeFile.name.split('.').pop().toLowerCase() : '';
      let enhancedError;
      
      if (error.message.includes('Unsupported file format')) {
        enhancedError = error;
      } else if (fileExtension) {
        enhancedError = new Error(`Error processing ${fileExtension} file: ${error.message}`);
      } else {
        enhancedError = error;
      }
      
      if (callbacks?.onError) {
        callbacks.onError(enhancedError);
      }
      throw enhancedError;
    }
  }
}

// Create singleton instance
const streamingHandler = new StreamHandler();
export default streamingHandler;

// ...existing code...