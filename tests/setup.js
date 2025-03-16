/**
 * Test utilities and setup for the resume-tailoring-app
 */

// Load environment variables early
import dotenv from 'dotenv';
dotenv.config();

/**
 * MockEventSource class for testing EventSource functionality
 */
class MockEventSource {
  constructor() {
    // Use a map to store event listeners by event type
    this._listeners = new Map();
    this.readyState = 0; // CONNECTING
    this.url = '';
    this.withCredentials = false;
    
    // Make these functions jest mocks so we can track calls
    this.close = jest.fn(() => {
      this.readyState = 2; // CLOSED
      this._listeners.clear();
    });
    
    this.dispatchEvent = jest.fn((event) => {
      if (!event || !event.type) return false;
      
      const listeners = this._listeners.get(event.type) || [];
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error(`Error in event listener for ${event.type}:`, error);
        }
      });
      return !event.defaultPrevented;
    });

    this.addEventListener = jest.fn((type, listener) => {
      if (!this._listeners.has(type)) {
        this._listeners.set(type, []);
      }
      this._listeners.get(type).push(listener);
    });

    this.removeEventListener = jest.fn((type, listener) => {
      if (!this._listeners.has(type)) return;
      
      if (listener) {
        const listeners = this._listeners.get(type);
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
        if (listeners.length === 0) {
          this._listeners.delete(type);
        }
      } else {
        this._listeners.delete(type);
      }
    });
  }
}

/**
 * MessageEvent mock for testing
 */
global.MessageEvent = class MessageEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.data = options.data || null;
    this.origin = options.origin || '';
    this.lastEventId = options.lastEventId || '';
    this.source = options.source || null;
    this.ports = options.ports || [];
    this.defaultPrevented = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
};

// Mock Event
global.Event = class Event {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = options.bubbles || false;
    this.cancelable = options.cancelable || false;
    this.composed = options.composed || false;
    this.defaultPrevented = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
};

// Set global EventSource
global.EventSource = MockEventSource;
export { MockEventSource };

// Update FormData mock to better match browser behavior
global.FormData = class FormData {
  constructor() {
    this._data = new Map();
  }
  
  append(key, value) {
    this._data.set(key, value);
  }
  
  get(key) {
    return this._data.get(key);
  }
  
  has(key) {
    return this._data.has(key);
  }
  
  getAll(key) {
    return this._data.has(key) ? [this._data.get(key)] : [];
  }
  
  entries() {
    return Array.from(this._data.entries());
  }
};

// HTML Element mock for tests
class MockHTMLElement {
  constructor() {
    this.innerHTML = '';
  }
}

global.HTMLElement = MockHTMLElement;

// Mock console methods to reduce test noise
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
};

// Mock Mistral API responses
global.mockMistralApi = {
  success: true,
  data: {
    choices: [{
      message: {
        content: '{"technicalSkills":["test skill"],"softSkills":["communication"]}'
      }
    }]
  }
};

// Enhanced axios mock for Mistral API
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    post: jest.fn().mockImplementation((url, data) => {
      if (!process.env.TEST_API_KEY) {
        throw new Error('TEST_API_KEY not found in environment');
      }
      
      const auth = data.headers?.Authorization;
      if (!auth || !auth.includes(process.env.TEST_API_KEY)) {
        return Promise.reject({
          response: {
            status: 401,
            data: { error: 'Invalid API key' }
          }
        });
      }
      
      return Promise.resolve(global.mockMistralApi);
    }),
    interceptors: {
      response: {
        use: jest.fn()
      }
    }
  }))
}));

// Verify environment setup
if (!process.env.TEST_API_KEY) {
  console.error('TEST_API_KEY not found in environment variables');
  process.exit(1);
}

// Reset all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});