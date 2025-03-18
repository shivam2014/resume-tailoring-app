export class ConnectionManager {
    constructor() {
        this.streamConnections = {};
        this.retryAttempts = 0;
        this.maxRetries = 3;
        this.retryDelay = 5000;
    }

    /**
     * Creates an EventSource connection to the specified endpoint
     * @param {string} endpoint - URL to connect to
     * @returns {EventSource} The created EventSource object
     */
    connect(endpoint) {
        const eventSource = new EventSource(endpoint);
        // Store the connection
        if (endpoint.includes('analyze')) {
            this.streamConnections.analyze = eventSource;
        } else if (endpoint.includes('tailor')) {
            this.streamConnections.tailor = eventSource;
        }
        return eventSource;
    }

    /**
     * Sets up event listeners for an EventSource connection
     * @param {EventSource} eventSource - The EventSource instance
     * @param {Object} callbacks - Object containing callback functions
     * @returns {EventSource} The configured EventSource instance
     */
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

    /**
     * Cleans up an EventSource connection
     * @param {EventSource} eventSource - The EventSource instance to clean up
     */
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

    /**
     * Closes a specific stream connection
     * @param {string} streamType - Type of stream to close ('analyze' or 'tailor')
     */
    closeStream(streamType) {
        if (this.streamConnections[streamType]) {
            this.cleanup(this.streamConnections[streamType]);
            this.streamConnections[streamType] = null;
        }
    }

    /**
     * Closes all stream connections
     */
    closeAllStreams() {
        Object.keys(this.streamConnections).forEach(streamType => {
            this.closeStream(streamType);
        });
    }

    /**
     * Gets a connection by type
     * @param {string} type - Connection type ('analyze' or 'tailor')
     * @returns {EventSource|null} The connection if exists, null otherwise
     */
    getConnection(type) {
        return this.streamConnections[type] || null;
    }

    /**
     * Sets a connection by type
     * @param {string} type - Connection type ('analyze' or 'tailor')
     * @param {EventSource|null} connection - The connection to set
     */
    setConnection(type, connection) {
        if (connection === null) {
            this.closeStream(type);
        } else {
            this.streamConnections[type] = connection;
        }
    }
}