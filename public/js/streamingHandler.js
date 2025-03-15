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
    }

    createChunkProcessor(callback) {
        return (chunk) => this.processChunk(chunk, callback);
    }

    setupEventListeners(eventSource, callbacks) {
        eventSource.addEventListener('chunk', (event) => {
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
        });

        eventSource.addEventListener('complete', (event) => {
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
        });

        eventSource.addEventListener('status', (event) => {
            try {
                const data = JSON.parse(event.data);
                if (callbacks.onStatusUpdate) {
                    callbacks.onStatusUpdate(data.status, data.message);
                }
            } catch (error) {
                console.error('Error parsing status:', error);
            }
        });

        eventSource.addEventListener('error', (event) => {
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
        });
    }

    connect(endpoint) {
        const eventSource = new EventSource(endpoint);
        return eventSource;
    }

    cleanup(eventSource) {
        if (eventSource) {
            eventSource.close();
            // Fix: Remove all event listeners properly
            eventSource.removeEventListener('chunk');
            eventSource.removeEventListener('complete');
            eventSource.removeEventListener('status');
            eventSource.removeEventListener('message');
            eventSource.removeEventListener('error');
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

    /**
     * Stream job analysis from the server
     * @param {FormData} formData - FormData containing resume file, job description, and API key
     * @param {Object} callbacks - Object containing callback functions
     * @param {Function} callbacks.onChunk - Called with each chunk of content
     * @param {Function} callbacks.onComplete - Called with parsed job requirements when complete
     * @param {Function} callbacks.onStatus - Called with status updates
     * @param {Function} callbacks.onError - Called when error occurs
     */
    async streamAnalyzeJob(formData, callbacks) {
        // Close any existing connection
        this.closeStream('analyze');

        try {
            console.log('Starting job analysis...');
            
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
            
            // Process events from the server
            eventSource.addEventListener('chunk', (event) => {
                try {
                    // Validate event data exists
                    if (!event.data) {
                        throw new Error('No data received from server');
                    }
                    
                    // Parse JSON with validation
                    const data = JSON.parse(event.data);
                    if (typeof data !== 'object' || data === null) {
                        throw new Error('Invalid JSON structure');
                    }
                    
                    // Validate required fields
                    if (!data.content && !data.status && !data.error) {
                        throw new Error('Missing required fields in JSON');
                    }
                    
                    // Process valid content
                    if (callbacks.onChunk && data.content) {
                        callbacks.onChunk(data.content);
                    } else if (callbacks.onError) {
                        callbacks.onError(data.error || 'No content field in response');
                    }
                } catch (error) {
                    console.error('Error processing chunk:', error.message);
                    if (callbacks.onError) {
                        callbacks.onError(`Failed to process server response: ${error.message}`);
                    }
                    // Provide fallback data
                    if (callbacks.onChunk) {
                        callbacks.onChunk('');
                    }
                }
            });

            eventSource.addEventListener('complete', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (callbacks.onComplete && data.jobRequirements) {
                        if (Object.keys(data.jobRequirements).length === 0) {
                            console.warn('Warning: Empty requirements object received');
                        }
                        callbacks.onComplete(data.jobRequirements);
                    } else {
                        console.error('No job requirements in complete event');
                        if (callbacks.onError) {
                            callbacks.onError('No requirements extracted from job description');
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

            eventSource.addEventListener('status', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (callbacks.onStatusUpdate) {
                        callbacks.onStatusUpdate(data.status, data.message);
                    }
                } catch (error) {
                    console.error('Error parsing status data:', error);
                }
            });

            eventSource.addEventListener('error', (event) => {
                console.error('EventSource error:', event);
                if (callbacks.onError) {
                    let errorMessage = 'Stream connection error';
                    if (event.data) {
                        try {
                            const data = JSON.parse(event.data);
                            errorMessage = data.error || errorMessage;
                        } catch (e) {
                            console.warn('Failed to parse error event data:', e.message);
                            // If we have raw data but can't parse it, include it in the error
                            errorMessage = `Invalid response format: ${event.data}`;
                        }
                    } else {
                        errorMessage = 'No data received from server';
                    }
                    callbacks.onError(errorMessage);
                }
                this.closeStream('analyze');
                // Attempt to reconnect if we haven't exceeded max retries
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
        // Close any existing connection
        this.closeStream('tailor');

        try {
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
            
            // Process events from the server
            eventSource.addEventListener('chunk', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (callbacks.onChunk && data.content) {
                        callbacks.onChunk(data.content);
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
                } finally {
                    this.closeStream('tailor');
                }
            });

            eventSource.addEventListener('status', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (callbacks.onStatusUpdate) {
                        callbacks.onStatusUpdate(data.status, data.message);
                    }
                } catch (error) {
                    console.error('Error parsing status data:', error);
                }
            });

            eventSource.addEventListener('error', (event) => {
                console.error('EventSource error:', event);
                if (callbacks.onError) {
                    let errorMessage = 'Stream connection error';
                    if (event.data) {
                        try {
                            const data = JSON.parse(event.data);
                            errorMessage = data.error || errorMessage;
                        } catch (e) {
                            // Keep default error message if parsing fails
                        }
                    }
                    callbacks.onError(errorMessage);
                }
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