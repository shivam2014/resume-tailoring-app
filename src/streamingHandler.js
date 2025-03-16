const MistralHelper = require('./mistralHelper.js').default;

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
      // Handle completion
      (parsedJobRequirements) => {
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
      // Handle error
      (error) => {
        sessionData.error = error;
        sessionData.isAnalyzing = false;
        
        console.error(`Error in analysis session ${sessionData.sessionId}:`, error);
        
        if (sessionData.clients && Array.isArray(sessionData.clients)) {
          sessionData.clients.forEach(client => {
            client.write(`data: ${JSON.stringify({ type: 'error', message: error })}\n\n`);
          });
        }
      }
    );
    
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
