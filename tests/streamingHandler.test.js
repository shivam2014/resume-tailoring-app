// Import the class directly, not the default export
import { StreamHandler } from '../public/js/streamingHandler.js';

describe('StreamHandler', () => {
  let handler;
  let mockEventSources;
  
  beforeEach(() => {
    // Clear all mocks before each test
    fetch.mockClear();
    
    // Create a fresh instance for each test
    handler = new StreamHandler();
    
    // Mock the internal eventSource objects that would be created
    mockEventSources = {
      analyze: new EventSource(),
      tailor: new EventSource()
    };
    
    // Patch the StreamHandler to use our mocks
    handler.createEventSource = jest.fn((url) => {
      if (url.includes('/stream-analyze-events')) {
        handler.streamConnections.analyze = mockEventSources.analyze;
        return mockEventSources.analyze;
      } else if (url.includes('/stream-tailor-events')) {
        handler.streamConnections.tailor = mockEventSources.tailor;
        return mockEventSources.tailor;
      }
    });
  });

  describe('connection management', () => {
    it('should establish SSE connection', async () => {
      const callbacks = {
        onChunk: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
        onStatus: jest.fn()
      };
      
      await handler.streamAnalyzeJob({ jobDescription: 'test job' }, callbacks);
      
      expect(fetch).toHaveBeenCalledWith('/stream-analyze', expect.any(Object));
      expect(handler.streamConnections.analyze).toBeDefined();
    });

    it('should handle connection cleanup', () => {
      handler.streamConnections.analyze = mockEventSources.analyze;
      handler.closeStream('analyze');
      
      expect(mockEventSources.analyze.close).toHaveBeenCalled();
      expect(handler.streamConnections.analyze).toBeNull();
    });

    it('should manage multiple stream types', async () => {
      const callbacks = {
        onChunk: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
        onStatusUpdate: jest.fn()
      };
      
      await handler.streamAnalyzeJob({ jobDescription: 'test' }, callbacks);
      await handler.streamTailorResume({ resumeContent: 'test', jobRequirements: {} }, callbacks);
      
      expect(handler.streamConnections.analyze).toBeDefined();
      expect(handler.streamConnections.tailor).toBeDefined();
    });
  });

  describe('chunk processing', () => {
    it('should process valid JSON chunks', () => {
      const processor = handler.createChunkProcessor(jest.fn());
      const validChunk = '{"content": "test content"}';
      
      processor(validChunk);
      
      // No error should be thrown
      expect(true).toBe(true);
    });

    it('should handle malformed chunks', () => {
      const mockCallback = jest.fn();
      const processor = handler.createChunkProcessor(mockCallback);
      const invalidChunk = '{invalid json}';
      
      // Should not throw an error
      expect(() => processor(invalidChunk)).not.toThrow();
    });
  });

  describe('stream analysis', () => {
    it('should handle job analysis streaming', async () => {
      const callbacks = {
        onChunk: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
        onStatusUpdate: jest.fn()
      };
      
      // Setup fetch response
      fetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: {
            get: (header) => header === 'content-type' ? 'application/json' : null
          },
          json: () => Promise.resolve({ sessionId: 'test-session' })
        })
      );
      
      await handler.streamAnalyzeJob({ 
        jobDescription: 'test job description',
        apiKey: 'test-key' 
      }, callbacks);
      
      expect(fetch).toHaveBeenCalledWith('/stream-analyze', expect.any(Object));
      expect(handler.streamConnections.analyze).toBeDefined();
    });

    it('should handle analysis errors', async () => {
      const callbacks = {
        onChunk: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
        onStatusUpdate: jest.fn()
      };
      
      // Simulate fetch error
      fetch.mockImplementationOnce(() => 
        Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: 'Invalid request' })
        })
      );
      
      await handler.streamAnalyzeJob({ jobDescription: 'test' }, callbacks);
      
      expect(callbacks.onError).toHaveBeenCalled();
    });
  });

  describe('resume tailoring', () => {
    it('should handle resume tailoring streaming', async () => {
      const callbacks = {
        onChunk: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
        onStatusUpdate: jest.fn()
      };
      
      // Setup fetch response
      fetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: {
            get: (header) => header === 'content-type' ? 'application/json' : null
          },
          json: () => Promise.resolve({ sessionId: 'test-session' })
        })
      );
      
      await handler.streamTailorResume({ 
        resumeContent: 'test content',
        jobRequirements: { skills: ['JavaScript'] },
        apiKey: 'test-key'
      }, callbacks);
      
      expect(fetch).toHaveBeenCalledWith('/stream-tailor', expect.any(Object));
      expect(handler.streamConnections.tailor).toBeDefined();
    });

    it('should validate required fields', async () => {
      const callbacks = {
        onChunk: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
        onStatusUpdate: jest.fn()
      };
      
      // No data provided
      const data = {};
      await handler.streamTailorResume(data, callbacks);
      expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining('Missing required fields'));
    });
  });

  describe('event handling', () => {
    it('should handle stream events properly', () => {
      const callbacks = {
        onChunk: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
        onStatusUpdate: jest.fn()
      };
      
      const eventSource = new EventSource();
      handler.setupEventListeners(eventSource, callbacks);
      
      // Trigger events
      eventSource.dispatchEvent(new MessageEvent('chunk', {
        data: JSON.stringify({ content: 'test content' })
      }));
      
      eventSource.dispatchEvent(new MessageEvent('complete', {
        data: JSON.stringify({ jobRequirements: { skills: ['JavaScript'] } })
      }));
      
      eventSource.dispatchEvent(new MessageEvent('status', {
        data: JSON.stringify({ status: 'testing', message: 'Test status' })
      }));
      
      eventSource.dispatchEvent(new MessageEvent('error', {
        data: JSON.stringify({ error: 'Test error' })
      }));
      
      expect(callbacks.onChunk).toHaveBeenCalledWith('test content');
      expect(callbacks.onComplete).toHaveBeenCalledWith({ skills: ['JavaScript'] });
      expect(callbacks.onStatusUpdate).toHaveBeenCalledWith('testing', 'Test status');
      expect(callbacks.onError).toHaveBeenCalledWith('Test error');
    });
  });

  describe('cleanup handling', () => {
    it('should clean up all connections on close', () => {
      // Setup connections
      handler.streamConnections.analyze = mockEventSources.analyze;
      handler.streamConnections.tailor = mockEventSources.tailor;
      
      handler.closeAllStreams();
      
      expect(mockEventSources.analyze.close).toHaveBeenCalled();
      expect(mockEventSources.tailor.close).toHaveBeenCalled();
    });

    it('should handle non-existent connections', () => {
      // No connections
      handler.streamConnections.analyze = null;
      handler.streamConnections.tailor = null;
      
      // Should not throw an error
      expect(() => handler.closeAllStreams()).not.toThrow();
    });
  });

  describe('status updates', () => {
    it('should update connection status', () => {
      const callbacks = {
        onChunk: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
        onStatusUpdate: jest.fn()
      };
      
      const eventSource = new EventSource();
      handler.setupEventListeners(eventSource, callbacks);
      
      const statusEvent = new MessageEvent('status', {
        data: JSON.stringify({ status: 'analyzing', message: 'Working...' })
      });
      eventSource.dispatchEvent(statusEvent);
      
      expect(callbacks.onStatusUpdate).toHaveBeenCalledWith('analyzing', 'Working...');
    });

    it('should handle multiple status updates', () => {
      const callbacks = {
        onChunk: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
        onStatusUpdate: jest.fn()
      };
      
      const eventSource = new EventSource();
      handler.setupEventListeners(eventSource, callbacks);
      
      const status1 = new MessageEvent('status', {
        data: JSON.stringify({ status: 'analyzing', message: 'Starting...' })
      });
      const status2 = new MessageEvent('status', {
        data: JSON.stringify({ status: 'complete', message: 'Done!' })
      });
      
      eventSource.dispatchEvent(status1);
      eventSource.dispatchEvent(status2);
      
      expect(callbacks.onStatusUpdate).toHaveBeenCalledTimes(2);
    });
  });
});