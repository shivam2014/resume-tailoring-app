// Mock browser environment for frontend tests
global.EventSource = class {
  constructor() {
    this.addEventListener = jest.fn();
    this.removeEventListener = jest.fn();
    this.close = jest.fn();
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
    json: () => Promise.resolve({ sessionId: 'test-session' })
  })
);

// Mock dotenv for API key
process.env.MISTRAL_API_KEY = 'test-api-key';

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
}

// Mock TextDecoder
global.TextDecoder = class {
  decode(chunk) {
    return chunk.toString();
  }
};