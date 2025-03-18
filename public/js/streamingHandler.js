/**
 * streamingHandler.js
 * Handles streaming API responses from Mistral AI for the Resume Tailoring Application
 */

import { LatexProcessor } from '../../src/streaming/processors/LatexProcessor';

import { ConnectionManager } from '../../src/streaming/core/ConnectionManager';

export class StreamHandler {
    constructor() {
        this.connectionManager = new ConnectionManager();
        this.accumulatedContent = '';
        // Connection management is handled by ConnectionManager
    }

    /**
     * Validates and cleans LaTeX content
     * @param {string} content - LaTeX content to validate
     * @returns {string} - Cleaned LaTeX content
     */
    validateLatexContent(content) {
        return LatexProcessor.cleanContent(content);
    }

    processChunk(chunk, callback) {
        try {
            // Validate chunk is not empty
            if (!chunk || chunk.trim() === '') {
                throw new Error('Empty chunk received');
            }

            // Check if this is LaTeX content
            if (chunk.includes('\\') && (chunk.includes('\\documentclass') || chunk.includes('\\begin'))) {
                // Process as LaTeX
                const cleanedLatex = this.validateLatexContent(chunk);
                callback({
                    content: cleanedLatex,
                    type: 'latex'
                });
                return;
            }

            // Process as JSON if not LaTeX
            const data = JSON.parse(chunk);
            if (typeof data !== 'object' || data === null) {
                throw new Error('Invalid JSON structure');
            }
            
            if (!data.content && !data.status && !data.error) {
                throw new Error('Missing required fields in JSON');
            }
            
            callback(data);
        } catch (e) {
            console.error('Error processing chunk:', e);
            callback({
                error: e.message,
                content: '',
                status: 'error'
            });
        }
    }

    createChunkProcessor(callback) {
        return (chunk) => this.processChunk(chunk, callback);
    }

    setupEventListeners(eventSource, callbacks) {
        return this.connectionManager.setupEventListeners(eventSource, callbacks);
    }

    connect(endpoint) {
        return this.connectionManager.connect(endpoint);
    }

    cleanup(eventSource) {
        this.connectionManager.cleanup(eventSource);
    }

    processChunk(chunk, callback) {
        try {
            // Validate chunk is not empty
            if (!chunk || chunk.trim() === '') {
                throw new Error('Empty chunk received');
            }

            // Check if this is LaTeX content
            if (chunk.includes('\\') && (chunk.includes('\\documentclass') || chunk.includes('\\begin'))) {
                // Process as LaTeX
                const cleanedLatex = this.validateLatexContent(chunk);
                if (cleanedLatex) {
                    callback({
                        content: cleanedLatex,
                        type: 'latex'
                    });
                    return;
                }
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
        try {
            if (!formData) {
                throw new Error('Form data is required');
            }

            if (typeof formData.has !== 'function') {
                throw new Error('Invalid form data object');
            }

            const requiredFields = ['jobDescription', 'apiKey'];
            for (const field of requiredFields) {
                if (!formData.has(field) || !formData.get(field)) {
                    throw new Error(`Missing required field: ${field}`);
                }
            }

            // Validate requirements if present
            const requirements = formData.get('requirements');
            if (requirements) {
                try {
                    JSON.parse(requirements);
                } catch (e) {
                    throw new Error('Invalid JSON format in requirements');
                }
            }

            return true;
        } catch (error) {
            if (errorCallback) {
                errorCallback(error.message);
                return false;
            }
            throw error;
        }
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
        try {
            // Reset accumulated content
            this.accumulatedContent = '';
            
            // Ensure error callback exists
            if (!callbacks.onError) {
                callbacks.onError = console.error;
            }
            
            // Validate fields
            if (!this.validateAnalyzeFields(formData, callbacks.onError)) {
                return null;
            }
            
            // Close any existing connection
            this.closeStream('analyze');

            // Make the API request
            const response = await fetch('/stream-analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jobDescription: formData.get('jobDescription'),
                    apiKey: formData.get('apiKey'),
                    requirements: {inverse: false} // Use simple format for analysis endpoint
                })
            });

            // Rest of the existing code...
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();
            if (!data || !data.sessionId) {
                throw new Error('No valid session ID returned from server');
            }

            // Create event source and set up connection
            const eventSource = this.createEventSource(`/stream-analyze-events?sessionId=${data.sessionId}`);
            this.streamConnections.analyze = eventSource;
            
            // Set up event listeners
            this.setupEventListeners(eventSource, callbacks);
            
            // Dispatch open event after slight delay to ensure listeners are attached
            setTimeout(() => {
                eventSource.dispatchEvent(new MessageEvent('open'));
            }, 0);
            
            return eventSource;
        } catch (error) {
            if (callbacks.onError) {
                callbacks.onError(error.message);
            }
            return null;
        }

        try {
            console.log('Starting job analysis...');
            
            this.connectionManager.ensureStreamConnections();
            
            // Validate required fields before sending the request
            if (!formData.has('jobDescription') || !formData.get('jobDescription')) {
                throw new Error('Missing required field: jobDescription');
            }
            
            if (!formData.has('apiKey') || !formData.get('apiKey')) {
                throw new Error('Missing required field: apiKey');
            }
            
            // Convert FormData to JSON object with requirements
            const requestBody = {
                jobDescription: formData.get('jobDescription'),
                apiKey: formData.get('apiKey'),
                requirements: formData.get('requirements') ? JSON.parse(formData.get('requirements')) : {inverse: false}
            };

            const response = await fetch('/stream-analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
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
            const eventSource = this.connectionManager.connect(`/stream-analyze-events?sessionId=${data.sessionId}`);
            this.connectionManager.setStream('analyze', eventSource);
            
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
        // Remove debug logging
        // Reset accumulated content
        this.accumulatedContent = '';
        
        // Close any existing connection
        this.closeStream('tailor');

        try {
            // Validate inputs
            if (!callbacks?.onComplete || !callbacks?.onError) {
                throw new Error('Missing required callbacks: onComplete and onError are required');
            }

            if (!data) {
                throw new Error('No data provided for resume tailoring');
            }

            // Validate required fields
            const missingFields = [];
            if (!data.resumeContent) {
                missingFields.push('resumeContent');
            }
            if (!data.jobRequirements) {
                missingFields.push('jobRequirements');
            }
            if (missingFields.length > 0) {
                throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
            }

            // Validate resume content format
            const cleanedResume = this.validateLatexContent(data.resumeContent);
            if (!cleanedResume) {
                throw new Error('Invalid LaTeX resume content');
            }

            // Remove debug logging

            // First send the data to initiate the streaming and get a session ID
            const formData = new FormData();
            const file = new File([data.resumeContent], "resume.tex", { type: "application/x-latex" });
            formData.append('resume', file);

            // Remove debug logging
            // Format requirements as expected by the server
            const formattedRequirements = {
                messages: [{
                    role: "system",
                    content: JSON.stringify(data.jobRequirements)
                }]
            };
            formData.append('requirements', JSON.stringify(formattedRequirements));
            formData.append('apiKey', data.apiKey);
            if (data.tailorPrompt) {
                formData.append('tailorPrompt', data.tailorPrompt);
            }

            const response = await fetch('/stream-tailor', {
                method: 'POST',
                body: formData
            });

            let errorData;
            const contentType = response.headers.get("content-type");
            // Log request details before checking response
            // Simplify server request logging
            console.log('Server request:', '/stream-tailor', 'POST');

            if (!response.ok) {
                const responseDetails = {
                    status: response.status,
                    statusText: response.statusText,
                    contentType: contentType,
                    headers: Object.fromEntries([...response.headers.entries()])
                };
                console.error('Server response error:', responseDetails);

                if (contentType && contentType.includes("application/json")) {
                    errorData = await response.json();
                    console.error('Server error details:', errorData);
                    
                    // Enhanced error message with more context
                    const errorMessage = errorData.error
                        ? `Server error: ${errorData.error} (Status: ${response.status})`
                        : `HTTP error! Status: ${response.status}`;
                    throw new Error(errorMessage);
                } else {
                    // Try to read the raw response text
                    const rawResponse = await response.text();
                    console.error('Raw error response:', rawResponse);
                    
                    // Log complete error context
                    // Simplify error logging
                    console.error('HTTP Error:', responseDetails.status, rawResponse);
                    
                    throw new Error(`HTTP error! Status: ${response.status}, Response: ${rawResponse}`);
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
            const eventSource = this.connectionManager.connect(`/stream-tailor-events?sessionId=${sessionId}`);
            this.connectionManager.setStream('tailor', eventSource);
            
            // Process events from the server with enhanced Mistral support
            eventSource.addEventListener('chunk', (event) => {
                try {
                    // Remove debug logging

                    if (!event.data) {
                        console.warn('Empty chunk received');
                        return;
                    }

                    // Process with Mistral handler first to handle [DONE] consistently
                    const processedData = processMistralEventData(event.data);
                    
                    if (processedData) {
                        if (processedData.done) {
                            console.log('[chunk event] Detected completion signal');
                            if (callbacks.onComplete && this.accumulatedContent) {
                                const cleanLatex = this.validateLatexContent(this.accumulatedContent);
                                // Remove debug logging
                                if (cleanLatex) {
                                    callbacks.onComplete(cleanLatex);
                                } else {
                                    callbacks.onError('Failed to validate final LaTeX content');
                                }
                            }
                            this.accumulatedContent = '';
                            this.closeStream('tailor');
                            return;
                        }

                        // Handle valid content
                        if (processedData.content) {
                            const cleanContent = this.validateLatexContent(processedData.content);
                            if (cleanContent) {
                                // Essential operation, no debug log needed
                                this.accumulatedContent += cleanContent;
                                if (callbacks.onChunk) {
                                    callbacks.onChunk(cleanContent);
                                }
                            }
                        }
                        return;
                    }

                    // Try parsing as JSON first
                    try {
                        const parsed = JSON.parse(event.data);
                        if (parsed.content) {
                            const cleanContent = this.validateLatexContent(parsed.content);
                            if (cleanContent) {
                                this.accumulatedContent += cleanContent;
                                if (callbacks.onChunk) {
                                    callbacks.onChunk(cleanContent);
                                }
                            }
                            return;
                        }
                    } catch (parseError) {
                        console.debug('Not JSON content, treating as raw LaTeX');
                    }

                    // Handle as raw LaTeX content
                    const cleanContent = this.validateLatexContent(event.data);
                    if (cleanContent) {
                        this.accumulatedContent += cleanContent;
                        if (callbacks.onChunk) {
                            callbacks.onChunk(cleanContent);
                        }
                    }
                } catch (error) {
                    console.error('Error processing chunk:', error);
                    if (callbacks.onError) {
                        callbacks.onError(`Failed to process chunk: ${error.message}`);
                    }
                }
            });

            eventSource.addEventListener('complete', (event) => {
                try {
                    console.debug('[complete event] Starting resume changes processing:', {
                        hasData: !!event.data,
                        dataType: typeof event.data,
                        dataPreview: event.data ? event.data.substring(0, 100) : 'no data',
                        accumulatedLength: this.accumulatedContent?.length || 0,
                        eventType: event.type,
                        hasCallbacks: {
                            onComplete: !!callbacks.onComplete,
                            onError: !!callbacks.onError
                        }
                    });

                    let finalContent = '';

                    if (event.data) {
                        try {
                            const data = JSON.parse(event.data);
                            console.debug('[complete event] Parsed data:', {
                                hasModifiedContent: !!data.modifiedContent,
                                modifiedContentType: typeof data.modifiedContent,
                                modifiedContentLength: data.modifiedContent?.length || 0,
                                modifiedContentPreview: data.modifiedContent ?
                                    data.modifiedContent.substring(0, 100) + '...' : 'none'
                            });

                            if (data.modifiedContent) {
                                // Remove debug logging
                                
                                finalContent = this.validateLatexContent(data.modifiedContent);
                                
                                // Remove debug logging
                            } else {
                                console.warn('[complete event] No modifiedContent in data');
                            }
                        } catch (parseError) {
                            console.error('Parse error:', parseError.message);
                        }
                    } else {
                        console.warn('[complete event] No event data received');
                    }

                    // Fallback to accumulated content
                    if (!finalContent && this.accumulatedContent) {
                        // Remove debug logging
                        
                        finalContent = this.validateLatexContent(this.accumulatedContent);
                        
                        // Remove debug logging
                    }

                    // Final completion check
                    if (finalContent) {
                        // Remove debug logging
                        
                        if (callbacks.onComplete) {
                            callbacks.onComplete(finalContent);
                        } else {
                            console.error('[complete event] No onComplete callback available');
                        }
                    } else {
                        console.error('No valid content available for completion');
                        if (callbacks.onError) {
                            callbacks.onError('No valid LaTeX content available');
                        }
                    }
                } catch (error) {
                    console.error('Error in complete handler:', error);
                    if (callbacks.onError) {
                        callbacks.onError('Error processing completion: ' + error.message);
                    }
                } finally {
                    this.accumulatedContent = '';
                    this.closeStream('tailor');
                }
            });
            
            // Add message event listener for final processing
            eventSource.addEventListener('message', (event) => {
                try {
                    if (!event.data) return;

                    if (event.data === '[DONE]') {
                        console.log('Received [DONE] message event in tailoring');
                        if (callbacks.onComplete && this.accumulatedContent) {
                            // Final cleanup and validation of LaTeX content
                            const cleanLatex = this.validateLatexContent(this.accumulatedContent);
                            if (cleanLatex) {
                                callbacks.onComplete(cleanLatex);
                            } else {
                                callbacks.onError('Failed to validate final LaTeX content');
                            }
                            this.accumulatedContent = '';
                        }
                        this.closeStream('tailor');
                        return;
                    }

                    // Handle non-[DONE] messages
                    const processedData = processMistralEventData(event.data);
                    if (processedData && processedData.done) {
                        if (callbacks.onComplete && this.accumulatedContent) {
                            const cleanLatex = this.validateLatexContent(this.accumulatedContent);
                            callbacks.onComplete(cleanLatex);
                            this.accumulatedContent = '';
                        }
                        this.closeStream('tailor');
                    }
                } catch (error) {
                    console.error('Error in message handler:', error);
                    if (callbacks.onError) {
                        callbacks.onError(`Message processing error: ${error.message}`);
                    }
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
     * Extract content from different file types
     * @param {File} file - The uploaded file
     * @returns {Promise<string>} - The extracted content
     */
    extractFileContent(file) {
        return new Promise((resolve, reject) => {
            const fileReader = new FileReader();
            const fileName = file.name.toLowerCase();
            const fileExtension = '.' + fileName.split('.').pop();
            
            // Add support for multiple file formats
            const allowedExtensions = ['.tex', '.json', '.md', '.txt'];
            if (!allowedExtensions.includes(fileExtension)) {
                reject(new Error(`Unsupported file format. Allowed formats: ${allowedExtensions.join(', ')}`));
                return;
            }
            
            fileReader.onload = async (event) => {
                try {
                    const content = event.target.result;
                    
                    if (fileExtension === '.json') {
                        try {
                            const jsonData = JSON.parse(content);
                            // Extract text from JSON using our helper function
                            const extractedText = this.extractTextFromJSON(jsonData);
                            resolve(extractedText);
                        } catch (e) {
                            reject(new Error('Invalid JSON format'));
                        }
                    } else if (['.txt', '.tex', '.md'].includes(fileExtension)) {
                        // These formats can be used directly as text
                        resolve(content);
                    } else {
                        reject(new Error(`Unsupported file format: ${fileExtension}`));
                    }
                } catch (error) {
                    reject(new Error(`Error extracting content: ${error.message}`));
                }
            };
            
            fileReader.onerror = () => reject(new Error('Error reading file'));
            fileReader.readAsText(file);
        });
    }

    /**
     * Extract text from JSON structure
     * @param {Object} jsonData - Parsed JSON data
     * @returns {string} - Extracted text
     */
    extractTextFromJSON(jsonData) {
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
     * Close a specific stream connection
     * @param {string} streamType - Type of stream to close ('analyze' or 'tailor')
     */
    closeStream(streamType) {
        this.connectionManager.closeStream(streamType);
    }

    /**
     * Close all stream connections
     */
    closeAllStreams() {
        this.connectionManager.closeAllStreams();
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
  // Remove debug logging

  // Handle various [DONE] token formats
  if (typeof text === 'string') {
    const trimmed = text.trim();
    if (trimmed === '[DONE]' || trimmed === '"[DONE]"' || trimmed === ' [DONE]') {
      // Remove debug logging
      return { done: true };
    }
  }

  // Clean the text before parsing
  const cleanText = typeof text === 'string' ?
    text.replace(/^\s*"?\[DONE\]"?\s*$/, '').trim() : text;

  if (!cleanText) {
    // Remove debug logging
    return null;
  }
  
  try {
    // Try parsing the cleaned text
    return JSON.parse(cleanText);
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
    // Remove debug logging

    // Handle empty or invalid input
    if (!eventData) {
      console.warn('Empty event data received');
      return null;
    }

    // Use extractValidJSON to handle [DONE] token uniformly
    if (typeof eventData === 'string') {
      const result = extractValidJSON(eventData);
      if (result && result.done === true) {
        console.log('Received [DONE] token from Mistral API');
        return {
          done: true,
          status: 'complete',
          finish_reason: 'stop'
        };
      }
    }

    // If it's a string, try to clean it and parse
    if (typeof eventData === 'string') {
      // Remove any [DONE] tokens that might be mixed with content
      const cleanedData = eventData.replace('[DONE]', '').trim();
      if (!cleanedData) {
        return null;
      }

      try {
        const data = extractValidJSON(cleanedData);
        if (!data) {
          // If it's not JSON but we have content, return it as raw content
          return {
            content: cleanedData,
            status: 'streaming'
          };
        }
        return processDataObject(data);
      } catch (parseError) {
        console.warn('Error parsing event data:', parseError);
        // Return raw content if parsing fails
        return {
          content: cleanedData,
          status: 'streaming'
        };
      }
    }

    // If it's already an object, process it directly
    return processDataObject(eventData);
  } catch (error) {
    console.error('Error in processMistralEventData:', error);
    return null;
  }
}

function processDataObject(data) {
  try {
    if (!data) return null;
    
    // Check if the data indicates completion
    if (data.done === true) {
      return {
        done: true,
        status: 'complete',
        finish_reason: 'stop'
      };
    }
    
    // Standard Mistral API chat completion response format
    if (data.choices && Array.isArray(data.choices)) {
      const choice = data.choices[0];
      
      // Final message with finish reason
      if (choice.finish_reason) {
        return {
          content: choice.delta?.content || choice.message?.content || '',
          status: 'complete',
          finish_reason: choice.finish_reason,
          done: true,
          usage: data.usage || null
        };
      }
      
      // Streaming chunk
      if (data.object === 'chat.completion.chunk' && choice.delta) {
        return {
          content: choice.delta.content || '',
          status: 'streaming',
          finish_reason: null,
          id: data.id
        };
      }
      
      // Complete response
      if (data.object === 'chat.completion' && choice.message) {
        return {
          content: choice.message.content || '',
          status: 'complete',
          finish_reason: choice.finish_reason || 'stop',
          usage: data.usage || null,
          id: data.id
        };
      }
    }
    
    // Direct content
    if (data.content) {
      return {
        content: data.content,
        status: 'streaming'
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error processing data object:', error);
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

/**
 * Streams a resume tailoring request to the backend
 */
export function streamTailorResume(sessionId, resumeFile, requirements, options, callbacks = {}) {
    return new Promise((resolve, reject) => {
        try {
            console.log("Starting resume tailoring...");
            
            // Simple file validation
            if (!resumeFile || !(resumeFile instanceof File)) {
                throw new Error('Resume file is required');
            }

            // Read file content directly
            const reader = new FileReader();
            
            reader.onload = function(e) {
                const content = e.target.result;
                if (!content || content.trim().length === 0) {
                    reject(new Error("Resume file is empty"));
                    return;
                }

                // Prepare request data without format conversion
                const requestData = {
                    resumeContent: content,
                    jobRequirements: requirements,
                    sessionId: sessionId,
                    metadata: {
                        fileName: resumeFile.name,
                        fileSize: content.length
                    }
                };

                // Send the request
                const streamHandler = new StreamHandler();
                streamHandler.streamTailorResume(requestData, callbacks)
                    .then(() => {
                        console.log('Resume tailoring completed successfully');
                        resolve();
                    })
                    .catch(error => {
                        console.error('Resume tailoring failed:', error);
                        reject(error);
                    });
            };
            
            reader.onerror = function() {
                reject(new Error("Error reading the file"));
            };
            
            reader.readAsText(resumeFile);
        } catch (error) {
            console.error("Error in streamTailorResume:", error);
            reject(error);
        }
    });
}

/**
 * Extracts text content from a JSON structure
 */
/**
 * Validates and cleans LaTeX content
 * @param {string} content - LaTeX content to validate
 * @returns {string} - Cleaned LaTeX content
 */
function validateLatexContent(content) {
    try {
        // Handle invalid input
        if (!content) {
            console.warn('[validateLatexContent] Empty content received');
            return '';
        }

        // Convert to string if needed
        const textContent = String(content).trim();
        // Remove debug logging

        if (!textContent) {
            console.warn('[validateLatexContent] Content is empty after trimming');
            return '';
        }

        // Basic LaTeX structure validation
        const hasDocumentClass = textContent.includes('\\documentclass');
        const hasBeginDocument = textContent.includes('\\begin{document}');
        const hasEndDocument = textContent.includes('\\end{document}');

        // Log validation results
        if (!hasDocumentClass || !hasBeginDocument || !hasEndDocument) {
            console.warn('LaTeX content may be incomplete:', {
                hasDocumentClass,
                hasBeginDocument,
                hasEndDocument
            });
        }

        // Clean and normalize content
        let processedContent = textContent;

        const cleaningSteps = [
            { name: 'Fix newlines', regex: /\\n/g, replacement: '\n' },
            { name: 'Remove multiple newlines', regex: /\n{3,}/g, replacement: '\n\n' },
            { name: 'Normalize spaces around newlines', regex: /\s*\n\s*/g, replacement: '\n' },
            { name: 'Escape backslashes', regex: /\\\\/g, replacement: '\\\\' },
            { name: 'Remove null characters', regex: /\0/g, replacement: '' },
            { name: 'Normalize whitespace', regex: /\s+/g, replacement: ' ' }
        ];

        cleaningSteps.forEach(step => {
            const beforeLength = processedContent.length;
            processedContent = processedContent.replace(step.regex, step.replacement);
            // Remove debug logging
        });

        processedContent = processedContent.trim();
        // Remove debug logging

        if (!processedContent) {
            console.warn('[validateLatexContent] Content is empty after processing');
            return '';
        }

        return processedContent;
    } catch (error) {
        console.error('Error in validateLatexContent:', error);
        return '';
    }
}

function extractTextFromJSON(jsonData) {
    // Check common fields where content might be stored
    if (jsonData.content && typeof jsonData.content === 'string') {
        return jsonData.content;
    } else if (jsonData.text && typeof jsonData.text === 'string') {
        return jsonData.text;
    } else if (jsonData.sections && Array.isArray(jsonData.sections)) {
        // Combine text from all sections
        return jsonData.sections
            .map(section => {
                if (typeof section === 'string') return section;
                if (section.content) return section.content;
                if (section.text) return section.text;
                return '';
            })
            .filter(text => text.trim().length > 0)
            .join('\n\n');
    }
    
    // If no standard fields found, stringify the entire JSON as fallback
    return JSON.stringify(jsonData, null, 2);
}

/**
 * Validate inputs for streamTailorResume
 * @param {string} sessionId - Session ID
 * @param {File} resumeFile - Resume file
 * @param {Object|string} requirements - Job requirements
 * @returns {boolean} - True if valid
 * @throws {Error} - Error with message if invalid
 */
function validateStreamTailorInputs(sessionId, resumeFile, requirements) {
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
        throw new Error('Session ID is required');
    }
    
    if (!resumeFile || !(resumeFile instanceof File)) {
        throw new Error('Resume file is required');
    }
    
    const SUPPORTED_FORMATS = ['tex', 'txt', 'md', 'json'];
    const FUTURE_FORMATS = ['pdf', 'docx'];
    
    const fileExtension = resumeFile.name.split('.').pop().toLowerCase();
    
    // Remove debug logging
    
    if (!SUPPORTED_FORMATS.includes(fileExtension)) {
        if (FUTURE_FORMATS.includes(fileExtension)) {
            throw new Error(`${fileExtension.toUpperCase()} files will be supported in a future update. Currently supported formats: ${SUPPORTED_FORMATS.join(', ')}`);
        } else {
            throw new Error(`Unsupported file format: .${fileExtension}. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`);
        }
    }
    
    if (!requirements) {
        throw new Error('Job requirements are required');
    }
    
    return true;
}

