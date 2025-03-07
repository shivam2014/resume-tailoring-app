import streamingHandler, { StreamHandler } from '../public/js/streamingHandler.js';

describe('StreamHandler', () => {
  let handler;
  
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    handler = new StreamHandler();
  });

  describe('connection management', () => {
    it('should establish SSE connection', () => {
      const eventSource = handler.connect('/stream-analyze');
      expect(eventSource).toBeDefined();
      expect(eventSource instanceof EventSource).toBe(true);
    });

    it('should handle connection cleanup', () => {
      const mockEventSource = {
        close: jest.fn(),
        removeEventListener: jest.fn()
      };
      handler.cleanup(mockEventSource);
      expect(mockEventSource.close).toHaveBeenCalled();
      expect(mockEventSource.removeEventListener).toHaveBeenCalled();
    });

    it('should manage multiple stream types', () => {
      handler.streamConnections = {
        analyze: new EventSource('/stream-analyze'),
        tailor: new EventSource('/stream-tailor')
      };
      expect(handler.streamConnections.analyze).toBeDefined();
      expect(handler.streamConnections.tailor).toBeDefined();
    });
  });

  describe('chunk processing', () => {
    it('should process valid JSON chunks', () => {
      const mockChunk = JSON.stringify({
        type: 'analysis',
        content: 'test content'
      });
      const callback = jest.fn();
      
      handler.processChunk(mockChunk, callback);
      expect(callback).toHaveBeenCalledWith({
        type: 'analysis',
        content: 'test content'
      });
    });

    it('should handle malformed chunks', () => {
      const mockChunk = '{"type": "analysis", "content":';
      const callback = jest.fn();
      console.error = jest.fn(); // Mock console.error
      
      handler.processChunk(mockChunk, callback);
      expect(callback).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('stream analysis', () => {
    it('should handle job analysis streaming', async () => {
      const callbacks = {
        onChunk: jest.fn(),
        onComplete: jest.fn(),
        onStatus: jest.fn(),
        onError: jest.fn()
      };

      const formData = new FormData();
      formData.append('jobDescription', 'test job');
      formData.append('apiKey', 'test-api-key');

      await handler.streamAnalyzeJob(formData, callbacks);
      
      expect(fetch).toHaveBeenCalledWith('/stream-analyze', expect.any(Object));
      expect(handler.streamConnections.analyze).toBeDefined();
    });

    it('should handle analysis errors', async () => {
      const callbacks = {
        onChunk: jest.fn(),
        onComplete: jest.fn(),
        onStatus: jest.fn(),
        onError: jest.fn()
      };

      // Mock fetch to return an error
      global.fetch.mockImplementationOnce(() => 
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Test error' })
        })
      );

      const formData = new FormData();
      await handler.streamAnalyzeJob(formData, callbacks);
      expect(callbacks.onError).toHaveBeenCalled();
    });
  });

  describe('resume tailoring', () => {
    it('should handle resume tailoring streaming', async () => {
      const callbacks = {
        onChunk: jest.fn(),
        onComplete: jest.fn(),
        onStatus: jest.fn(),
        onError: jest.fn()
      };

      const data = {
        resumeContent: 'test content',
        jobRequirements: { skills: ['test'] },
        apiKey: 'test-api-key'
      };

      await handler.streamTailorResume(data, callbacks);
      
      expect(fetch).toHaveBeenCalledWith('/stream-tailor', expect.any(Object));
      expect(handler.streamConnections.tailor).toBeDefined();
    });

    it('should validate required fields', async () => {
      const callbacks = {
        onChunk: jest.fn(),
        onComplete: jest.fn(),
        onStatus: jest.fn(),
        onError: jest.fn()
      };

      // Mock fetch to simulate missing fields error
      global.fetch.mockImplementationOnce(() => 
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Missing required fields' })
        })
      );

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
        onStatus: jest.fn(),
        onError: jest.fn()
      };

      const eventSource = handler.connect('/test-stream');
      
      // Test chunk event
      const chunkEvent = new MessageEvent('chunk', {
        data: JSON.stringify({ content: 'test content' })
      });
      eventSource.dispatchEvent(chunkEvent);

      // Test complete event
      const completeEvent = new MessageEvent('complete', {
        data: JSON.stringify({ modifiedContent: 'final content' })
      });
      eventSource.dispatchEvent(completeEvent);

      // Test error event
      const errorEvent = new Event('error');
      eventSource.dispatchEvent(errorEvent);

      expect(eventSource.addEventListener).toHaveBeenCalledWith('chunk', expect.any(Function));
      expect(eventSource.addEventListener).toHaveBeenCalledWith('complete', expect.any(Function));
      expect(eventSource.addEventListener).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('cleanup handling', () => {
    it('should clean up all connections on close', () => {
      const mockEventSources = {
        analyze: { close: jest.fn(), removeEventListener: jest.fn() },
        tailor: { close: jest.fn(), removeEventListener: jest.fn() }
      };

      handler.streamConnections = mockEventSources;
      handler.closeAllStreams();

      expect(mockEventSources.analyze.close).toHaveBeenCalled();
      expect(mockEventSources.tailor.close).toHaveBeenCalled();
    });

    it('should handle non-existent connections', () => {
      expect(() => handler.closeAllStreams()).not.toThrow();
    });
  });

  describe('status updates', () => {
    it('should update connection status', () => {
      const statusCallback = jest.fn();
      handler.setStatusCallback(statusCallback);
      handler.updateStatus('connected');
      expect(statusCallback).toHaveBeenCalledWith('connected');
    });

    it('should handle multiple status updates', () => {
      const statusCallback = jest.fn();
      handler.setStatusCallback(statusCallback);
      
      const statuses = ['connecting', 'connected', 'processing', 'complete'];
      statuses.forEach(status => {
        handler.updateStatus(status);
      });

      expect(statusCallback).toHaveBeenCalledTimes(statuses.length);
      statuses.forEach(status => {
        expect(statusCallback).toHaveBeenCalledWith(status);
      });
    });
  });
});