import dotenv from 'dotenv';

// Load environment variables early
dotenv.config();

// Mock browser environment for frontend tests
class MockEventSource {
  constructor() {
    this.addEventListener = jest.fn((event, handler) => {
      this._handlers = this._handlers || {};
      this._handlers[event] = handler;
      return this;
    });
    this.removeEventListener = jest.fn();
    this.close = jest.fn();
    this.dispatchEvent = jest.fn((event) => {
      if (this._handlers && this._handlers[event.type]) {
        this._handlers[event.type](event);
      }
    });
  }
}

global.EventSource = MockEventSource;

// Mock MessageEvent
global.MessageEvent = class {
  constructor(type, options = {}) {
    this.type = type;
    this.data = options.data || '';
    this.origin = options.origin || '';
    this.lastEventId = options.lastEventId || '';
    this.source = options.source || null;
    this.ports = options.ports || [];
  }
};

// Mock Event
global.Event = class {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = options.bubbles || false;
    this.cancelable = options.cancelable || false;
    this.composed = options.composed || false;
  }
};

// Mock FormData
global.FormData = class {
  constructor() {
    this.data = {};
  }
  append(key, value) {
    this.data[key] = value;
  }
  get(key) {
    return this.data[key];
  }
};

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: {
      get: (name) => name === 'content-type' ? 'application/json' : null
    },
    json: () => Promise.resolve({ sessionId: 'test-session' })
  })
);

// Mock dotenv for API key
process.env.MISTRAL_API_KEY = 'test-api-key';

// Create document.querySelectorAll mock
document.querySelectorAll = (selector) => {
  return [{
    innerHTML: 'test content',
  }];
};

// Mock window.document for JSDOM
if (typeof window !== 'undefined') {
  window.document.createRange = () => ({
    setStart: () => {},
    setEnd: () => {},
    commonAncestorContainer: {
      nodeName: 'BODY',
      ownerDocument: document,
    },
  });
  
  // Add Diff2Html mock to window for tests that need it
  window.Diff2Html = {
    html: jest.fn((diff, options) => `<div class="mock-diff2html">${diff}</div>`),
    parse: jest.fn((diff) => diff)
  };
}

// Mock TextDecoder
global.TextDecoder = class {
  decode(chunk) {
    return chunk.toString();
  }
};

// HTML Element mock for tests
class MockHTMLElement {
  constructor() {
    this.innerHTML = '';
  }
}

global.HTMLElement = MockHTMLElement;

// Console mocks to reduce noise during testing
global.console.warn = jest.fn();

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