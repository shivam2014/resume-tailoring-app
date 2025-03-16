/**
 * streamingHandler.js
 * Handles streaming API responses from Mistral AI for the Resume Tailoring Application
 */

export class StreamHandler {
    constructor() {
        this.streamConnections = {};
        this.retryAttempts = 0;
        this.maxRetries = 3;
        this.retryDelay = 5000;
        this.accumulatedContent = ''; // Add shared accumulated content property
    }

    createChunkProcessor(callback) {
        return (chunk) => this.processChunk(chunk, callback);
    }

    setupEventListeners(eventSource, callbacks) {
        // Remove any existing listeners first
        this.cleanup(eventSource);

        // Create and store chunk event listener
        eventSource._chunkListener = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (callbacks.onChunk && data.content) {
                    callbacks.onChunk(data.content);
                }
            } catch (error) {
                console.error('Error processing chunk:', error);
                if (callbacks.onError) {
                    callbacks.onError('Failed to process server response: ' + error.message);
                }
            }
        };
        eventSource.addEventListener('chunk', eventSource._chunkListener);

        // Create and store complete event listener
        eventSource._completeListener = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (callbacks.onComplete) {
                    callbacks.onComplete(data.jobRequirements || data.modifiedContent);
                }
            } catch (error) {
                console.error('Error processing complete:', error);
                if (callbacks.onError) {
                    callbacks.onError('Error processing results: ' + error.message);
                }
            }
        };
        eventSource.addEventListener('complete', eventSource._completeListener);

        // Create and store status event listener
        eventSource._statusListener = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (callbacks.onStatusUpdate) {
                    callbacks.onStatusUpdate(data.status, data.message);
                }
            } catch (error) {
                console.error('Error parsing status:', error);
            }
        };
        eventSource.addEventListener('status', eventSource._statusListener);

        // Create and store error event listener
        eventSource._errorListener = (event) => {
            if (callbacks.onError) {
                let errorMessage = 'Stream connection error';
                if (event.data) {
                    try {
                        const data = JSON.parse(event.data);
                        errorMessage = data.error || errorMessage;
                    } catch (e) {
                        errorMessage = 'Invalid response format';
                    }
                }
                callbacks.onError(errorMessage);
            }
        };
        eventSource.addEventListener('error', eventSource._errorListener);

        // Create and store message event listener
        eventSource._messageListener = (event) => {
            if (event.data === '[DONE]') {
                if (callbacks.onComplete) {
                    callbacks.onComplete(this.accumulatedContent || '');
                }
                this.closeStream('analyze');
            }
        };
        eventSource.addEventListener('message', eventSource._messageListener);

        return eventSource;
    }

    connect(endpoint) {
        const eventSource = new EventSource(endpoint);
        return eventSource;
    }
    
    /**
     * Creates an EventSource connection to the specified endpoint
     * @param {string} endpoint - URL to connect to
     * @returns {EventSource} The created EventSource object
     */
    createEventSource(endpoint) {
        return new EventSource(endpoint);
    }

    cleanup(eventSource) {
        if (eventSource) {
            // Close the connection
            eventSource.close();
            
            // Remove all standard event listeners
            const events = ['chunk', 'complete', 'status', 'message', 'error'];
            events.forEach(event => {
                eventSource.removeEventListener(event, eventSource[`_${event}Listener`]);
            });
        }
    }

    processChunk(chunk, callback) {
        try {
            // Validate chunk is not empty
            if (!chunk || chunk.trim() === '') {
                throw new Error('Empty chunk received');
            }
            
            // Parse JSON with validation
            const data = JSON.parse(chunk);
            if (typeof data !== 'object' || data === null) {
                throw new Error('Invalid JSON structure');
            }
            
            // Validate required fields
            if (!data.content && !data.status && !data.error) {
                throw new Error('Missing required fields in JSON');
            }
            
            callback(data);
        } catch (e) {
            console.error('Error processing chunk:', e);
            // Provide fallback data structure
            callback({
                error: e.message,
                content: '',
                status: 'error'
            });
        }
    }

    handleError(error) {
        console.error('Stream error:', error);
        // Attempt reconnection after 5 seconds
        setTimeout(() => this.connect(), 5000);
    }

    setStatusCallback(callback) {
        this.statusCallback = callback;
    }

    updateStatus(status) {
        if (this.statusCallback) {
            this.statusCallback(status);
        }
    }

    logEvent(message, level = 'info') {
        const timestamp = new Date().toISOString();
        console[level](`[${timestamp}] StreamHandler: ${message}`);
        
        // You could also send important logs to the server
        if (level === 'error') {
            try {
                fetch('/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        timestamp, 
                        level, 
                        message,
                        source: 'streamingHandler'
                    })
                }).catch(err => console.error('Failed to send log to server:', err));
            } catch (e) {
                // Silent catch - don't let logging errors affect the app
            }
        }
    }

    validateAnalyzeFields(formData, errorCallback) {
        this.logEvent('Validating form fields...');
        
        // Check if formData is null or undefined
        if (!formData) {
            if (errorCallback) {
                errorCallback('Invalid form data object');
                return false;
            } else {
                const error = new Error('Form data is required');
                error.code = 'MISSING_FORM_DATA';
                throw error;
            }
        }
        
        // Improved debug logging - safely handle formData that might not have entries method
        console.log('Validating form fields:', 
            Array.from(formData.entries ? formData.entries() : [])
                .map(([key, val]) => `${key}: ${typeof val === 'string' ? 
                    (val.length > 50 ? val.substring(0, 20) + '...' : val) : 
                    '[' + (typeof val) + ']'}`));
        
        // Check form data is valid
        if (typeof formData.has !== 'function') {
            if (errorCallback) {
                errorCallback('Invalid form data object');
                return false;
            } else {
                const error = new Error('Invalid form data object');
                error.code = 'INVALID_FORM_DATA';
                throw error;
            }
        }

        // Check required fields
        const requiredFields = ['jobDescription', 'apiKey'];
        for (const field of requiredFields) {
            if (!formData.has(field) || !formData.get(field)) {
                if (errorCallback) {
                    errorCallback(`Missing required field: ${field}`);
                    return false;
                } else {
                    const error = new Error(`Missing required field: ${field}`);
                    error.code = 'MISSING_FIELD';
                    throw error;
                }
            }
        }
        
        return true;
    }

    /**
     * Stream job analysis from the server
     * @param {FormData} formData - FormData containing resume file, job description, and API key
     * @param {Object} callbacks - Object containing callback functions
     * @param {Function} callbacks.onChunk - Called with each chunk of content
     * @param {Function} callbacks.onComplete - Called with parsed job requirements when complete
     * @param {Function} callbacks.onStatus - Called with status updates
     * @param {Function} callbacks.onError - Called when error occurs
     */
    async streamAnalyzeJob(formData, callbacks = {}) {
        // Reset accumulated content when starting a new stream
        this.accumulatedContent = '';
        
        // Console log to aid debugging 
        console.log('Starting job analysis...');
        
        // Check for required callbacks
        if (!callbacks.onError) {
            console.error('No error callback provided');
            return null;
        }
        
        // Validate fields
        if (!this.validateAnalyzeFields(formData, callbacks.onError)) {
            console.error('Error in streamAnalyzeJob: Error: Missing required fields');
            return null;
        }
        
        // Close any existing connection
        this.closeStream('analyze');

        try {
            console.log('Starting job analysis...');
            
            if (!this.streamConnections) {
                this.streamConnections = {};
            }
            
            // Validate required fields before sending the request
            if (!formData.has('jobDescription') || !formData.get('jobDescription')) {
                throw new Error('Missing required field: jobDescription');
            }
            
            if (!formData.has('apiKey') || !formData.get('apiKey')) {
                throw new Error('Missing required field: apiKey');
            }
            
            const response = await fetch('/stream-analyze', {
                method: 'POST',
                body: formData
            });

            let errorData;
            const contentType = response.headers.get("content-type");
            if (!response.ok) {
                if (contentType && contentType.includes("application/json")) {
                    errorData = await response.json();
                    throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
                } else {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
            }

            if (!contentType || !contentType.includes("application/json")) {
                throw new Error(`Invalid content type received: ${contentType || 'none'}`);
            }

            let data;
            try {
                data = await response.json();
            } catch (error) {
                throw new Error(`Failed to parse server response as JSON: ${error.message}`);
            }
            if (!data || !data.sessionId) {
                throw new Error('No valid session ID returned from server');
            }
            
            // Now connect to the streaming endpoint with the session ID
            const eventSource = new EventSource(`/stream-analyze-events?sessionId=${data.sessionId}`);
            this.streamConnections.analyze = eventSource;
            
            // Process events from the server with Mistral-specific handling
            eventSource.addEventListener('chunk', (event) => {
                try {
                    // Validate event data exists
                    if (!event.data) {
                        throw new Error('No data received from server');
                    }
                    
                    // Check for [DONE] token - this indicates the end of the stream
                    if (event.data === '[DONE]' || event.data.includes('[DONE]')) {
                        console.log('Received [DONE] token, streaming complete');
                        
                        // If we have a completion callback, call it with the accumulated content
                        if (callbacks.onComplete && this.accumulatedContent) {
                            callbacks.onComplete(this.accumulatedContent);
                            // Reset accumulated content after completion
                            this.accumulatedContent = '';
                        }
                        
                        // Close the stream - we're done
                        this.closeStream('analyze');
                        return;
                    }
                    
                    // Process with Mistral-specific handler
                    const processedData = processMistralEventData(event.data);
                    
                    if (processedData) {
                        // Check if this is a completion signal
                        if (processedData.done === true) {
                            console.log('Processed data indicates completion');
                            
                            // If we have accumulated content and a completion callback, call it
                            if (callbacks.onComplete && this.accumulatedContent) {
                                callbacks.onComplete(this.accumulatedContent);
                                // Reset accumulated content
                                this.accumulatedContent = '';
                            }
                            
                            // Close the stream - we're done
                            this.closeStream('analyze');
                            return;
                        }
                        
                        // Regular content chunk - append to accumulated content
                        if (processedData.content) {
                            this.accumulatedContent += processedData.content;
                            
                            // Call the chunk callback if provided
                            if (callbacks.onChunk) {
                                callbacks.onChunk(processedData.content);
                            }
                        }
                    } else if (callbacks.onError) {
                        callbacks.onError('Invalid or empty content in response');
                    }
                } catch (error) {
                    console.error('Error processing chunk:', error.message);
                    if (callbacks.onError) {
                        callbacks.onError(`Failed to process server response: ${error.message}`);
                    }
                    // Provide fallback
                    if (callbacks.onChunk) {
                        callbacks.onChunk('');
                    }
                }
            });

            eventSource.addEventListener('complete', (event) => {
                try {
                    // First try our enhanced JSON extraction
                    const extractedData = extractValidJSON(event.data);
                    
                    // If that works, use it directly
                    if (extractedData) {
                        if (callbacks.onComplete) {
                            if (extractedData.jobRequirements) {
                                callbacks.onComplete(extractedData.jobRequirements);
                            } else if (extractedData.modifiedContent) {
                                callbacks.onComplete(extractedData.modifiedContent);
                            } else if (extractedData.choices && extractedData.choices[0] && 
                                      extractedData.choices[0].message && 
                                      extractedData.choices[0].message.content) {
                                // Handle direct Mistral API response format
                                const content = extractedData.choices[0].message.content;
                                
                                // Try to parse the content as JSON if it looks like JSON
                                if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
                                    try {
                                        const parsedContent = JSON.parse(content);
                                        callbacks.onComplete(parsedContent);
                                    } catch (jsonError) {
                                        // If it's not valid JSON, just use it as plain text
                                        callbacks.onComplete(content);
                                    }
                                } else {
                                    // Plain text response
                                    callbacks.onComplete(content);
                                }
                            } else {
                                console.warn('Unrecognized complete response format:', extractedData);
                                callbacks.onError('Invalid response format: missing required fields');
                            }
                        }
                    } else {
                        // Fallback to old processing method
                        console.warn('Falling back to simple JSON parsing');
                        const data = JSON.parse(event.data);
                        
                        if (callbacks.onComplete) {
                            if (data.jobRequirements) {
                                callbacks.onComplete(data.jobRequirements);
                            } else if (data.modifiedContent) {
                                callbacks.onComplete(data.modifiedContent);
                            } else {
                                callbacks.onError('No recognized content in response');
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error processing completion:', error.message);
                    if (callbacks.onError) {
                        callbacks.onError('Error processing analysis results: ' + error.message);
                    }
                } finally {
                    this.closeStream('analyze');
                }
            });

            // Add message event listener for [DONE] tokens
            eventSource.addEventListener('message', (event) => {
                if (event.data === '[DONE]') {
                    console.log('Received [DONE] message event');
                    // This indicates the end of streaming
                    // We can simulate a complete event here
                    if (callbacks.onComplete) {
                        callbacks.onComplete(this.accumulatedContent || '');
                    }
                    this.closeStream('analyze');
                }
            });

            eventSource.addEventListener('error', (event) => {
                console.error('EventSource error:', event);
                if (callbacks.onError) {
                    let errorMessage = 'Stream connection error';
                    
                    if (event.data) {
                        try {
                            // Try enhanced JSON extraction first
                            const extractedData = extractValidJSON(event.data);
                            
                            if (extractedData) {
                                // Process error with Mistral-specific handler
                                errorMessage = processMistralError(extractedData);
                            } else {
                                // Fallback to simple JSON parsing
                                const data = JSON.parse(event.data);
                                errorMessage = processMistralError(data);
                            }
                        } catch (e) {
                            console.warn('Failed to parse error event data:', e.message);
                            // If we have raw data but can't parse it as JSON, include it in the error
                            errorMessage = `Response parsing error: ${event.data}`;
                        }
                    }
                    
                    callbacks.onError(errorMessage);
                }
                
                // Reset accumulated content
                this.accumulatedContent = '';
                
                this.closeStream('analyze');
                
                // Attempt reconnection if needed
                if (this.retryAttempts < this.maxRetries) {
                    this.retryAttempts++;
                    console.log(`Retrying connection (attempt ${this.retryAttempts}/${this.maxRetries})...`);
                    setTimeout(() => {
                        this.streamAnalyzeJob(formData, callbacks);
                    }, this.retryDelay);
                } else {
                    console.error('Max retry attempts reached');
                    this.retryAttempts = 0; // Reset for next time
                }
            });
        } catch (error) {
            console.error('Error in streamAnalyzeJob:', error);
            if (callbacks.onError) {
                callbacks.onError('Error: ' + error.message);
            }
        }
    }

    /**
     * Stream resume tailoring from the server
     * @param {Object} data - Object containing resume content, job requirements, and API key
     * @param {Object} callbacks - Object containing callback functions
     * @param {Function} callbacks.onChunk - Called with each chunk of content
     * @param {Function} callbacks.onComplete - Called with full modified content when complete
     * @param {Function} callbacks.onStatus - Called with status updates
     * @param {Function} callbacks.onError - Called when error occurs
     */
    async streamTailorResume(data, callbacks) {
        // Reset accumulated content
        this.accumulatedContent = '';
        
        // Close any existing connection
        this.closeStream('tailor');

        try {
            // Validate required fields
            if (!data || !data.resumeContent || !data.jobRequirements) {
                throw new Error('Missing required fields: resumeContent and jobRequirements are required');
            }
            // Validate required fields
            if (!data.resumeContent || !data.jobRequirements) {
                throw new Error('Missing required fields: resumeContent and jobRequirements are required');
            }
            
            // First send the data to initiate the streaming and get a session ID
            const response = await fetch('/stream-tailor', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            let errorData;
            const contentType = response.headers.get("content-type");
            if (!response.ok) {
                if (contentType && contentType.includes("application/json")) {
                    errorData = await response.json();
                    throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
                } else {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
            }

            if (!contentType || !contentType.includes("application/json")) {
                throw new Error("Server response was not JSON");
            }

            const sessionData = await response.json();
            if (!sessionData || !sessionData.sessionId) {
                throw new Error('No valid session ID returned from server');
            }

            const sessionId = sessionData.sessionId;
            
            // Now connect to the streaming endpoint with the session ID
            const eventSource = new EventSource(`/stream-tailor-events?sessionId=${sessionId}`);
            this.streamConnections.tailor = eventSource;
            
            // Process events from the server with enhanced Mistral support
            eventSource.addEventListener('chunk', (event) => {
                try {
                    // Check for [DONE] token
                    if (event.data === '[DONE]' || event.data.includes('[DONE]')) {
                        console.log('Received [DONE] token in tailoring');
                        
                        if (callbacks.onComplete && this.accumulatedContent) {
                            callbacks.onComplete(this.accumulatedContent);
                            this.accumulatedContent = '';
                        }
                        
                        this.closeStream('tailor');
                        return;
                    }
                    
                    // Process with Mistral handler
                    const processedData = processMistralEventData(event.data);
                    
                    if (processedData && processedData.content) {
                        // Accumulate content
                        this.accumulatedContent += processedData.content;
                        
                        if (callbacks.onChunk) {
                            callbacks.onChunk(processedData.content);
                        }
                    } else {
                        // Try fallback parsing
                        const data = JSON.parse(event.data);
                        if (callbacks.onChunk && data.content) {
                            this.accumulatedContent += data.content;
                            callbacks.onChunk(data.content);
                        }
                    }
                } catch (error) {
                    console.error('Error parsing chunk data:', error);
                }
            });

            eventSource.addEventListener('complete', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (callbacks.onComplete && data.modifiedContent) {
                        callbacks.onComplete(data.modifiedContent);
                    }
                } catch (error) {
                    console.error('Error parsing complete data:', error);
                    if (callbacks.onError) {
                        callbacks.onError('Error processing tailoring results: ' + error.message);
                    }
                    
                    // If we have accumulated content, use it as fallback
                    if (this.accumulatedContent && callbacks.onComplete) {
                        callbacks.onComplete(this.accumulatedContent);
                    }
                } finally {
                    this.closeStream('tailor');
                }
            });
            
            // Add message event listener for [DONE] tokens in tailoring
            eventSource.addEventListener('message', (event) => {
                if (event.data === '[DONE]') {
                    console.log('Received [DONE] message event in tailoring');
                    if (callbacks.onComplete) {
                        callbacks.onComplete(this.accumulatedContent || '');
                    }
                    this.closeStream('tailor');
                }
            });

            eventSource.addEventListener('error', (event) => {
                console.error('EventSource error in tailoring:', event);
                if (callbacks.onError) {
                    let errorMessage = 'Stream connection error';
                    if (event.data) {
                        try {
                            // Enhanced error handling
                            const extractedData = extractValidJSON(event.data);
                            if (extractedData) {
                                errorMessage = processMistralError(extractedData);
                            } else {
                                const data = JSON.parse(event.data);
                                errorMessage = data.error || errorMessage;
                            }
                        } catch (e) {
                            // Keep default error message if parsing fails
                        }
                    }
                    callbacks.onError(errorMessage);
                }
                
                // Reset accumulated content
                this.accumulatedContent = '';
                
                this.closeStream('tailor');
            });
        } catch (error) {
            console.error('Error in streamTailorResume:', error);
            if (callbacks.onError) {
                callbacks.onError('Error: ' + error.message);
            }
        }
    }

    /**
     * Close a specific stream connection
     * @param {string} streamType - Type of stream to close ('analyze' or 'tailor')
     */
    closeStream(streamType) {
        if (this.streamConnections[streamType]) {
            this.cleanup(this.streamConnections[streamType]);
            this.streamConnections[streamType] = null;
        }
    }

    /**
     * Close all stream connections
     */
    closeAllStreams() {
        Object.keys(this.streamConnections).forEach(streamType => {
            this.closeStream(streamType);
        });
    }
}

// Create a singleton instance for use throughout the application
const streamingHandler = new StreamHandler();
export default streamingHandler; // Default export for application use

/**
 * Standalone function for streamAnalyzeJob to support testing
 * @param {Object} jobData - Job data for analysis
 * @param {Function} onProgress - Progress callback
 * @param {Function} onComplete - Completion callback
 * @param {Function} onError - Error callback
 */
export async function streamAnalyzeJob(jobData, onProgress, onComplete, onError) {
    try {
        console.log('Starting job analysis...', jobData);
        
        // Validate required fields
        if (!jobData) {
            throw new Error("Missing job data");
        }
        
        // Validate sessionId
        if (!jobData.sessionId || typeof jobData.sessionId !== 'string' || jobData.sessionId.trim() === '') {
            throw new Error("Missing required field: sessionId must be a non-empty string");
        }
        
        // Validate content
        if (!jobData.content || typeof jobData.content !== 'object') {
            throw new Error("Missing required field: content must be an object");
        }
        
        if (typeof jobData.content.text !== 'string') {
            throw new Error("Missing required field: content.text must be a string");
        }
        
        // Validate options
        if (!jobData.options || typeof jobData.options !== 'object') {
            throw new Error("Missing required field: options must be an object");
        }

        // Continue with the existing implementation after validation succeeds
        const response = await fetch('/stream-analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(jobData)
        });

        // Basic response validation
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        // Process response
        if (onComplete) {
            onComplete({ success: true });
        }
    } catch (error) {
        console.error('Error in streamAnalyzeJob:', error);
        if (onError) {
            onError(error);
        }
    }
}

// Add standalone validation function for direct testing (following dual export pattern)
export function validateAnalyzeFields(formData) {
    // Check if formData is null or undefined
    if (!formData) {
        const error = new Error('Form data is required');
        error.code = 'MISSING_FORM_DATA';
        throw error;
    }
    
    // Check form data is valid
    if (typeof formData.has !== 'function') {
        const error = new Error('Invalid form data object');
        error.code = 'INVALID_FORM_DATA';
        throw error;
    }

    // Check all required fields
    const requiredFields = ['jobDescription', 'apiKey'];
    for (const field of requiredFields) {
        if (!formData.has(field) || !formData.get(field)) {
            const error = new Error(`Missing required field: ${field}`);
            error.code = 'MISSING_FIELD';
            throw error;
        }
    }
    
    return true;
}

/**
 * Validates job analysis input and processes the request
 * @param {Object} formData - Form data containing job description and resume
 * @param {Function} onUpdate - Callback function for updates
 * @param {Function} onError - Callback function for errors
 */
export async function processJobAnalysis(formData, onUpdate, onError) {
  try {
    console.log("Starting job analysis...");
    
    // Validate required fields
    if (!formData) {
      throw new Error("Missing form data");
    }
    
    const requiredFields = ['apiKey', 'jobDescription', 'resumeFile'];
    const missingFields = requiredFields.filter(field => !formData[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
    
    // Continue with existing processing logic
    // ...existing code...
  } catch (error) {
    console.error("Error in processJobAnalysis:", error);
    if (onError) onError(error);
  }
}

/**
 * Extracts valid JSON from a potentially malformed string
 * @param {string} text - The input text that may contain JSON
 * @returns {object|null} - Parsed JSON object or null if extraction failed
 */
function extractValidJSON(text) {
  // Check for Mistral API [DONE] token
  if (text === '[DONE]') {
    return { done: true };
  }
  
  try {
    // First try direct parsing
    return JSON.parse(text);
  } catch (e) {
    console.warn('Initial JSON parsing failed:', e.message);
    
    // Try to handle Mistral API specific formats first
    try {
      // Check if this might be multiple JSON objects concatenated (common in streaming)
      // Mistral API can sometimes return multiple chunks in one response
      if (text.includes('}{')) {
        // Try to split and parse the last complete object
        const parts = text.split('}{');
        const lastPart = parts[parts.length - 1];
        const reconstructed = '{' + lastPart;
        return JSON.parse(reconstructed);
      }
      
      // Handle Mistral streaming format which might have "data: " prefix
      if (text.includes('data: ')) {
        const dataLines = text.split('\n').filter(line => line.startsWith('data: '));
        if (dataLines.length > 0) {
          // Check for [DONE] token in the data lines
          if (dataLines.some(line => line.includes('[DONE]'))) {
            return { done: true };
          }
          
          // Take the last complete data line
          const lastDataLine = dataLines[dataLines.length - 1];
          const jsonContent = lastDataLine.substring(6); // Remove "data: " prefix
          return JSON.parse(jsonContent);
        }
      }
    } catch (mistralError) {
      console.warn('Failed to parse Mistral-specific format:', mistralError.message);
    }
    
    // Find patterns that look like complete JSON objects
    const jsonPattern = /(\{[\s\S]*\})/g;
    const matches = text.match(jsonPattern);
    
    if (matches && matches.length) {
      // Try each potential JSON object
      for (const potentialJson of matches) {
        try {
          return JSON.parse(potentialJson);
        } catch (innerError) {
          console.warn('Failed to parse potential JSON match:', innerError);
          // Continue to next match
        }
      }
    }
    
    // Try to find where the JSON might end properly
    try {
      // Look for a closing bracket followed by potential garbage
      const endBracketIndex = text.lastIndexOf('}');
      if (endBracketIndex > 0) {
        const possibleJson = text.substring(0, endBracketIndex + 1);
        return JSON.parse(possibleJson);
      }
    } catch (endError) {
      console.warn('Failed to extract JSON by finding end bracket:', endError);
    }
    
    // If all extraction attempts fail
    return null;
  }
}

/**
 * Process Mistral AI API specific event data
 * @param {string} eventData - Raw event data from SSE
 * @returns {Object|null} Processed event data or null if invalid
 */
function processMistralEventData(eventData) {
  try {
    // Check for [DONE] token first - this is Mistral's standard stream termination signal
    if (eventData === '[DONE]' || 
        (typeof eventData === 'string' && eventData.includes('[DONE]'))) {
      console.log('Received [DONE] token from Mistral API');
      return { 
        done: true,
        status: 'complete',
        finish_reason: 'stop'
      };
    }
    
    // Handle both string and object inputs
    const data = typeof eventData === 'string' ? extractValidJSON(eventData) : eventData;
    
    if (!data) return null;
    
    // Check if the extracted data contains a done flag
    if (data.done === true) {
      return {
        done: true,
        status: 'complete',
        finish_reason: 'stop'
      };
    }
    
    // Standard Mistral API chat completion response format
    if (data.choices && Array.isArray(data.choices)) {
      // Extract content from the delta or message object based on streaming vs non-streaming
      const choice = data.choices[0];
      
      // Check for finish_reason - if present and not null, this is the final message
      if (choice.finish_reason) {
        return {
          content: choice.delta?.content || choice.message?.content || '',
          status: 'complete',
          finish_reason: choice.finish_reason,
          done: true,
          // Include usage statistics if available
          usage: data.usage || null
        };
      }
      
      if (data.object === 'chat.completion.chunk' && choice.delta) {
        // Streaming format with delta - standard Mistral streaming response
        return {
          content: choice.delta.content || '',
          status: 'streaming',
          finish_reason: null,
          id: data.id
        };
      } else if (data.object === 'chat.completion' && choice.message) {
        // Complete non-streaming response
        return {
          content: choice.message.content || '',
          status: 'complete',
          finish_reason: choice.finish_reason || 'stop',
          usage: data.usage || null,
          id: data.id
        };
      }
    }
    
    // If this doesn't match Mistral format but has content, return as-is
    if (data.content) {
      return data;
    }
    
    return null;
  } catch (error) {
    console.error('Error processing Mistral event data:', error);
    return null;
  }
}

/**
 * Handle Mistral API specific error responses
 * @param {Object|string} errorData - Error data from API response
 * @returns {string} Formatted error message
 */
function processMistralError(errorData) {
  try {
    // If it's already a string, return it
    if (typeof errorData === 'string') {
      return errorData;
    }
    
    // Handle Mistral API standard error format
    if (errorData.error) {
      if (typeof errorData.error === 'object') {
        const { message, type, code } = errorData.error;
        let errorMsg = message || 'Unknown error';
        
        // Add additional context based on error type
        switch(type) {
          case 'authentication_error':
            return `Authentication error (${code}): ${errorMsg}. Please check your API key.`;
          case 'rate_limit_error':
            return `Rate limit exceeded (${code}): ${errorMsg}. Please try again later.`;
          case 'invalid_request_error':
            return `Invalid request (${code}): ${errorMsg}. Please check your request parameters.`;
          case 'server_error':
            return `Mistral AI server error (${code}): ${errorMsg}. Please try again later.`;
          default:
            return `${errorMsg} (${type}, code: ${code})`;
        }
      } else {
        return errorData.error;
      }
    }
    
    // Fallback for unrecognized error formats
    return JSON.stringify(errorData);
  } catch (e) {
    console.warn('Error processing Mistral error:', e);
    return 'Unknown error occurred';
  }
}

/**
 * Prepare parameters for Mistral API requests
 * @param {Object} options - User provided options
 * @returns {Object} Formatted parameters for Mistral API
 */
function prepareMistralParameters(options = {}) {
  // Default model if not specified
  const model = options.model || 'mistral-large-latest';
  
  // Extract standard Mistral API parameters
  const {
    messages,
    temperature = 0.7,
    top_p = 1.0,
    max_tokens,
    stream = true, // Default to streaming for our application
    stop,
    safe_prompt = false,
    random_seed
  } = options;
  
  // Construct parameters object with only defined values
  const params = { model };
  
  // Add required messages parameter
  if (Array.isArray(messages) && messages.length > 0) {
    params.messages = messages;
  } else if (options.prompt) {
    // Convert single prompt to messages format if needed
    params.messages = [{ role: 'user', content: options.prompt }];
  }
  
  // Add optional parameters only if they are defined
  if (temperature !== undefined) params.temperature = temperature;
  if (top_p !== undefined) params.top_p = top_p;
  if (max_tokens !== undefined) params.max_tokens = max_tokens;
  if (stream !== undefined) params.stream = stream;
  if (stop !== undefined) params.stop = stop;
  if (safe_prompt !== undefined) params.safe_prompt = safe_prompt;
  if (random_seed !== undefined) params.random_seed = random_seed;
  
  return params;
}

/**
 * Create proper message format for Mistral API
 * @param {string} resumeContent - Resume content
 * @param {Object|string} jobRequirements - Job requirements
 * @param {string} prompt - Prompt template with placeholders
 * @returns {Array} Messages array in Mistral format
 */
function createMistralMessages(resumeContent, jobRequirements, prompt) {
  // Format job requirements as JSON string if it's an object
  const jobReqString = typeof jobRequirements === 'object' ? 
    JSON.stringify(jobRequirements, null, 2) : 
    jobRequirements;
  
  // Replace placeholders in the prompt template
  let userPrompt = prompt
    .replace('[RESUME_CONTENT]', resumeContent || '')
    .replace('[JOB_REQUIREMENTS]', jobReqString || '');
  
  // Create the messages array format expected by Mistral
  return [
    { role: "user", content: userPrompt }
  ];
}
