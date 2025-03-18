const MistralHelper = require('./mistralHelper.js').default;

/**
 * Validates JSON content and returns parsed object
 * @param {string} content - JSON string to validate
 * @returns {Object} Parsed JSON object
 * @throws {Error} If JSON is invalid
 */
const validateJson = (content) => {
  try {
    // Remove any trailing characters after JSON closure
    const jsonEnd = Math.max(
      content.lastIndexOf('}'),
      content.lastIndexOf(']')
    );
    const cleanContent = content.slice(0, jsonEnd + 1);
    
    return JSON.parse(cleanContent);
  } catch (error) {
    console.error('JSON validation failed:', {
      originalContent: content,
      error: error.message
    });
    throw new Error(`Invalid JSON format: ${error.message}`);
  }
};

/**
 * Validates required input parameters for job analysis streaming
 * @param {Object} sessionData - Session data object
 */
const validateInput = (sessionData) => {
  if (!sessionData.sessionId) {
    throw new Error('Missing required field: sessionId');
  }
  if (!sessionData.jobDescription) {
    throw new Error('Missing required field: jobDescription');
  }
  if (!sessionData.apiKey) {
    throw new Error('Missing required field: apiKey');
  }
  // analyzePrompt is optional
};

/**
 * Stream job analysis using Mistral AI
 * This function is used by the server-side endpoint
 * @param {Object} sessionData - Session data containing jobDescription and apiKey
 * @returns {Object} Response containing session ID
 */
const streamAnalyzeJob = async (sessionData) => {
  try {
    validateInput(sessionData);
    sessionData.isAnalyzing = true;
    
    // Create MistralHelper instance with the session's API key
    const mistralHelper = new MistralHelper(sessionData.apiKey, { 
      analyzePrompt: sessionData.analyzePrompt 
    });
    
    // Use the helper to stream job description analysis
    const { abort } = await mistralHelper.streamAnalyzeJobDescription(
      sessionData.jobDescription,
      // Handle chunks
      (chunk) => {
        if (sessionData.clients && Array.isArray(sessionData.clients)) {
          sessionData.clients.forEach(client => {
            client.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
          });
        }
      },
      { // Options object
        onComplete: (parsedJobRequirements) => {
          sessionData.jobRequirements = parsedJobRequirements;
          sessionData.isAnalyzing = false;
          
          if (sessionData.clients && Array.isArray(sessionData.clients)) {
            sessionData.clients.forEach(client => {
              client.write(`data: ${JSON.stringify({
                type: 'complete',
                requirements: parsedJobRequirements
              })}\n\n`);
            });
          }
        },
        onError: (error) => {
          const errorMessage = error.message.includes('JSON')
            ? `Invalid JSON format: ${error.message}`
            : error.message;
            
          sessionData.error = errorMessage;
          sessionData.isAnalyzing = false;
          
          console.error(`Error in analysis session ${sessionData.sessionId}:`, {
            error: errorMessage,
            stack: error.stack
          });
          
          if (sessionData.clients && Array.isArray(sessionData.clients)) {
            sessionData.clients.forEach(client => {
              client.write(`data: ${JSON.stringify({
                type: 'error',
                message: errorMessage,
                code: 'INVALID_JSON'
              })}\n\n`);
            });
          }
        },
        cleanApiContent: (content) => {
          try {
            // Remove all markdown code block wrappers and trim
            let cleaned = content
              .replace(/^```(?:latex)?\n/, '')  // Handle both ``` and ```latex
              .replace(/\n```$/, '')
              .replace(/\\n/g, '\n')            // Convert escaped newlines
              .replace(/\\"/g, '"')            // Unescape quotes
              .trim();
            
            // Validate JSON structure before returning
            if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
              validateJson(cleaned); // Test parse using validation utility
            }
            
            if (!cleaned) {
              throw new Error('Empty content after cleaning Markdown formatting');
            }
            return cleaned;
          } catch (error) {
            console.error('Error cleaning API content:', {
              originalContent: content,
              error: error.message
            });
            throw new Error(`Invalid content format: ${error.message}`);
          }
        }
      }
    ).catch((error) => {
      // This is the additional error handler you wanted to keep
      sessionData.error = error;
      sessionData.isAnalyzing = false;
      
      console.error(`Error in analysis session ${sessionData.sessionId}:`, error);
      
      if (sessionData.clients && Array.isArray(sessionData.clients)) {
        sessionData.clients.forEach(client => {
          client.write(`data: ${JSON.stringify({ type: 'error', message: error })}\n\n`);
        });
      }
      throw error; // Re-throw to be caught by the outer try-catch
    });
    
    // Store abort function for potential cleanup
    sessionData.abortController = { abort };
    
    // Return response format matching API docs
    return { sessionId: sessionData.sessionId };
    
  } catch (error) {
    console.error(`Setup error in analysis session ${sessionData.sessionId}:`, error);
    sessionData.error = error.message;
    sessionData.isAnalyzing = false;
    
    if (sessionData.clients && Array.isArray(sessionData.clients)) {
      sessionData.clients.forEach(client => {
        client.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      });
    }
    
    // Return session ID even on error, per API docs
    return { sessionId: sessionData.sessionId, error: error.message };
  }
};

module.exports = {
  streamAnalyzeJob
};
