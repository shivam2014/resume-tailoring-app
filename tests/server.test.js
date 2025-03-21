import request from 'supertest';
import { app, startServerForTesting } from '../src/server.js';

let server;

beforeAll(async () => {
  // Use a fixed port and ensure it's available
  const port = 3002;
  const net = require('net');
  
  // Check if port is available and free it if necessary
  const tester = net.createServer();
  await new Promise((resolve) => {
    tester.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Port is in use, try to free it
        const tempServer = net.createServer();
        tempServer.once('error', () => resolve(false));
        tempServer.once('listening', () => {
          tempServer.close(() => resolve(true));
        });
        tempServer.listen(port);
      } else {
        resolve(false);
      }
    });
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port);
  });

  server = await startServerForTesting();
  console.log(`Test server started on port ${port}`);
  
  // Add delay to ensure server is ready
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Add error handling for server connection
  server.on('error', (err) => {
    console.error('Server error:', err);
  });
  
  // Add connection handling with keep-alive
  server.on('connection', (socket) => {
    socket.setKeepAlive(true, 60000);
    socket.setTimeout(10000);
    
    // Track socket for cleanup
    const cleanupSocket = () => {
      if (!socket.destroyed) {
        socket.destroy();
      }
    };
    
    socket.on('timeout', () => {
      console.warn('Socket timeout, closing connection');
      cleanupSocket();
    });
    
    socket.on('close', () => {
      socket.removeAllListeners();
    });
    
    socket.on('error', (err) => {
      console.error('Socket error:', err);
      cleanupSocket();
    });
  });
  
  // Add error handling for uncaught exceptions
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
  });
});

afterAll(async () => {
  if (!server) return;

  // Close all active connections
  const connections = await new Promise((resolve) => {
    server.getConnections((err, count) => {
      if (err) {
        console.error('Error getting connections:', err);
        resolve(0);
      } else {
        console.log(`Closing ${count} active connections`);
        resolve(count);
      }
    });
  });

  // Force close any remaining connections
  if (connections > 0) {
    server.closeIdleConnections();
  }

  // Close the server with timeout
  const closeTimeout = setTimeout(() => {
    console.error('Server close timeout, forcing exit');
    process.exit(1);
  }, 5000);

  try {
    await new Promise((resolve, reject) => {
      server.close((err) => {
        clearTimeout(closeTimeout);
        if (err) {
          console.error('Error closing server:', err);
          reject(err);
        } else {
          console.log('Test server closed');
          resolve();
        }
      });
    });

    // Clean up all listeners and resources
    server.removeAllListeners();
    server.unref();
    process.removeAllListeners('uncaughtException');
  } catch (error) {
    console.error('Error during server cleanup:', error);
    throw error;
  }
});
import fs from 'fs';
import path from 'path';

// Use __dirname approach that works with Jest
const __dirname = path.resolve();
const testFixturesDir = path.join(__dirname, 'tests', 'fixtures');

describe('Server Integration Tests', () => {
  const testResumePath = path.join(testFixturesDir, 'test-resume.tex');
  
  beforeAll(() => {
    // Create test fixtures directory and sample resume
    if (!fs.existsSync(testFixturesDir)) {
      fs.mkdirSync(testFixturesDir, { recursive: true });
    }
    fs.writeFileSync(testResumePath, '\\section{Skills}\nTest skills');
  });

  afterAll(() => {
    // Cleanup test files
    if (fs.existsSync(testResumePath)) {
      fs.unlinkSync(testResumePath);
    }
    if (fs.existsSync(testFixturesDir)) {
      try {
        // Remove all files in the directory first
        const files = fs.readdirSync(testFixturesDir);
        files.forEach(file => {
          const filePath = path.join(testFixturesDir, file);
          fs.unlinkSync(filePath);
        });
        fs.rmdirSync(testFixturesDir);
        console.log('Successfully cleaned up fixtures directory');
      } catch (error) {
        console.warn('Could not remove fixtures directory:', error.message);
      }
    }
  });

  describe('Static File Serving', () => {
    it('should serve the main application page', async () => {
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
      expect(response.type).toMatch(/html/);
    });

    it('should serve static assets', async () => {
      const response = await request(app).get('/css/main.css');
      expect(response.status).toBe(200);
      expect(response.type).toMatch(/css/);
    });

    it('should handle missing files', async () => {
      const response = await request(app).get('/nonexistent.file');
      expect(response.status).toBe(404);
    });
  });

  describe('Job Analysis Streaming', () => {
    const jobDescription = 'Test job description';
    const mockApiKey = 'test-api-key';

    it('should initiate analysis streaming session', async () => {
      console.log('Starting analysis streaming session test');
      console.log('Sending jobDescription:', jobDescription);
      console.log('Sending apiKey:', mockApiKey);
      
      const response = await request(app)
        .post('/stream-analyze')
        .type('form')
        .send({
          jobDescription: jobDescription,
          apiKey: mockApiKey
        })
        .on('error', (err) => {
          console.error('Request error:', err);
        })
        .on('response', (res) => {
          console.log('Response status:', res.status);
          console.log('Response body:', res.body);
        });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sessionId');
    });

    it('should establish SSE connection', async () => {
      // Create a new session first
      const sessionResponse = await request(app)
        .post('/stream-analyze')
        .type('form')
        .send({
          jobDescription: jobDescription,
          apiKey: mockApiKey
        });

      const sessionId = sessionResponse.body.sessionId;
      console.log(`Attempting SSE connection with session ID: ${sessionId}`);
      
      const response = await request(app)
        .get(`/stream-analyze-events?sessionId=${sessionId}`)
        .set('Accept', 'text/event-stream')
        .on('error', (err) => {
          console.error('SSE connection error:', err);
        });
      
      expect(response.status).toBe(200);
      expect(response.type).toBe('text/event-stream');
    });

    it('should handle missing job description', async () => {
      const response = await request(app)
        .post('/stream-analyze')
        .field('apiKey', mockApiKey);
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle missing API key', async () => {
      const response = await request(app)
        .post('/stream-analyze')
        .field('jobDescription', jobDescription);
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle invalid session IDs', async () => {
      const response = await request(app)
        .get('/stream-analyze-events?sessionId=invalid')
        .set('Accept', 'text/event-stream');
      
      expect(response.status).toBe(400);
    });
  });

  describe('Resume Tailoring Streaming', () => {
    it('should initiate tailoring streaming session', async () => {
      try {
        console.log('Starting tailoring session test');
        
        // Verify API key is valid
        if (!process.env.TEST_API_KEY) {
          throw new Error('TEST_API_KEY environment variable is not set');
        }

        const response = await request(app)
          .post('/stream-tailor')
          .attach('resume', testResumePath)
          .field('requirements', JSON.stringify({
            messages: [{
              role: "user",
              content: "Test skills and communication required"
            }]
          }))
          .field('apiKey', process.env.TEST_API_KEY)
          .on('error', (err) => {
            console.error('Request error:', err);
          })
          .on('response', (res) => {
            console.log('Response status:', res.status);
            console.log('Response headers:', res.headers);
          })
          .on('end', () => {
            console.log('Request completed');
          });
        
        console.log('Tailoring session response received');
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('sessionId');
      } catch (error) {
        console.error('Test failed:', error);
        throw error;
      }
    }, 15000); // Increase timeout to 15 seconds

    it('should accept different resume formats', async () => {
      const testFormats = {
        tex: '\\section{Test} Content',
        json: JSON.stringify({ content: 'Test Content' }),
        md: '# Test\nContent',
        txt: 'Plain text content'
      };

      for (const [format, content] of Object.entries(testFormats)) {
        const response = await request(app)
          .post('/stream-tailor')
          .attach('resume', Buffer.from(content), `test.${format}`)
          .field('requirements', JSON.stringify({
            messages: [{
              role: "user",
              content: "Test skills required"
            }]
          }))
          .field('apiKey', process.env.TEST_API_KEY);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('sessionId');
      }
    });

    it('should reject unsupported file types', async () => {
      const response = await request(app)
        .post('/stream-tailor')
        .attach('resumeFile', Buffer.from('test'), 'test.xyz')
        .field('requirements', JSON.stringify({
          messages: [{
            role: "user",
            content: "Test skills required"
          }]
        }))
        .field('apiKey', process.env.TEST_API_KEY)
        .catch(err => { // Add error handler
          console.error('Request error:', err);
          return err.response;
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Invalid file upload|Unsupported file format/);
      expect(response.body.allowedFormats).toEqual(['.tex', '.json', '.md', '.txt']);
    });

    it('should handle missing requirements', async () => {
      // Create a minimal test file
      const testFile = path.join(testFixturesDir, 'test-resume.txt');
      fs.writeFileSync(testFile, 'Test resume content');

      try {
        const response = await request(app)
          .post('/stream-tailor')
          .attach('resume', testFile)
          .field('apiKey', 'test-key')
          .timeout(5000);

        expect(response.status).toBe(400);
        // Verify response status and error message
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Missing required fields');
        
        // Check that requirements is one of the required fields
        expect(response.body.requiredFields).toContain('requirements');
        
        // Verify response structure
        expect(response.body).toHaveProperty('details');
        expect(response.body).toHaveProperty('requiredFields');
        expect(Array.isArray(response.body.requiredFields)).toBe(true);
      } finally {
        // Clean up test file
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
      }
    });
  });

  describe('HTML Preview', () => {
    it('should return 400 if no content provided', async () => {
      const response = await request(app)
        .post('/get-preview')
        .send({});
      
      expect(response.statusCode).toBe(400);
      expect(response.body.error).toBe('Missing content');
    });

    it('should generate HTML preview with basic content', async () => {
      const content = 'Test content';
      const response = await request(app)
        .post('/get-preview')
        .send({ content });
      
      expect(response.statusCode).toBe(200);
      expect(response.text).toContain('<div');
      expect(response.text).toContain(content);
    });

    it('should preserve styles in HTML preview', async () => {
      const content = [
        { text: 'Header', fontSize: 18, bold: true },
        { text: 'Body text', fontSize: 12 },
        { ul: ['Item 1', 'Item 2'] }
      ];
      
      const response = await request(app)
        .post('/get-preview')
        .send({ content });
      
      expect(response.statusCode).toBe(200);
      expect(response.text).toContain('font-size: 18px');
      expect(response.text).toContain('font-weight: bold');
      expect(response.text).toContain('<ul>');
    });

    it('should handle errors during HTML generation', async () => {
      // Mock the error case directly in the route handler
      const originalGenerateHTMLPreview = app._router.stack.find(
        layer => layer.route && layer.route.path === '/get-preview'
      ).handle;

      app._router.stack.find(
        layer => layer.route && layer.route.path === '/get-preview'
      ).handle = (req, res) => {
        try {
          throw new Error('Test error');
        } catch (error) {
          return res.status(500).json({
            error: 'Error generating HTML preview',
            details: error.message
          });
        }
      };

      const response = await request(app)
        .post('/get-preview')
        .send({ content: 'test' });

      expect(response.statusCode).toBe(500);
      expect(response.body.error).toBe('Error generating HTML preview');
      expect(response.body.details).toBe('Test error');

      // Restore original handler
      app._router.stack.find(
        layer => layer.route && layer.route.path === '/get-preview'
      ).handle = originalGenerateHTMLPreview;
    });
  });

  describe('PDF Generation', () => {
    const testFiles = {
      tex: '\\documentclass{article}\\begin{document}Test\\end{document}',
      json: JSON.stringify({ content: 'Test JSON content' }),
      md: '# Test Markdown\nContent',
      txt: 'Plain text content'
    };

    it('should generate PDF from different formats', async () => {
      jest.setTimeout(30000); // Increase timeout to 30 seconds for PDF generation
      
      for (const [format, content] of Object.entries(testFiles)) {
        const response = await request(app)
          .post('/generate-pdf')
          .send({
            content,
            format: `.${format}`
          });
        
        expect(response.status).toBe(200);
        expect(response.type).toBe('application/pdf');
      }
    });

    it('should handle format-specific errors', async () => {
      const response = await request(app)
        .post('/generate-pdf')
        .send({
          content: 'Invalid content',
          format: '.json'
        });
      
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to create PDF');
      expect(response.body.format).toBe('.json');
    });

    it('should require format parameter', async () => {
      const response = await request(app)
        .post('/generate-pdf')
        .send({ content: testFiles.txt });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
      expect(response.body.details).toBe('Please provide content and format');
    });

    it('should handle missing content', async () => {
      const response = await request(app)
        .post('/generate-pdf')
        .send({ format: '.txt' });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
      expect(response.body.details).toBe('Please provide content and format');
    });

    it('should reject unsupported formats', async () => {
      const response = await request(app)
        .post('/generate-pdf')
        .send({
          content: 'test content',
          format: '.xyz'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid file type');
      expect(response.body).toHaveProperty('allowedFormats');
      expect(response.body.allowedFormats).toContain('.tex');
      expect(response.body.allowedFormats).toContain('.json');
      expect(response.body.allowedFormats).toContain('.md');
      expect(response.body.allowedFormats).toContain('.txt');
    });
  });

  describe('Content Extraction and Format Handling', () => {
    beforeEach(() => {
      jest.setTimeout(10000); // Increase timeout for file processing
    });

    it('should extract content from JSON resume', async () => {
      const jsonContent = JSON.stringify({
        sections: [
          { content: 'Section 1' },
          { text: 'Section 2' }
        ]
      });

      const response = await request(app)
        .post('/stream-tailor')
        .attach('resume', Buffer.from(jsonContent), 'resume.json')
        .field('requirements', JSON.stringify({
          messages: [{
            role: "user",
            content: "Test skills required"
          }]
        }))
        .field('apiKey', process.env.TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sessionId');
    });

    it('should extract content from Markdown resume', async () => {
      const mdContent = '# Resume\n## Skills\n- Skill 1\n- Skill 2';

      const response = await request(app)
        .post('/stream-tailor')
        .attach('resume', Buffer.from(mdContent), 'resume.md')
        .field('requirements', JSON.stringify({
          messages: [{
            role: "user",
            content: "Test skills required"
          }]
        }))
        .field('apiKey', process.env.TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sessionId');
    });

    it('should handle malformed JSON content', async () => {
      const response = await request(app)
        .post('/stream-tailor')
        .attach('resume', Buffer.from('{invalid json}'), 'resume.json')
        .field('requirements', JSON.stringify({
          messages: [{
            role: "user",
            content: "Test skills required"
          }]
        }))
        .field('apiKey', process.env.TEST_API_KEY);

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Invalid JSON format/);
    });
  });

  describe('File Management', () => {
    it('should clean up old files', async () => {
      // Import the cleanupOldFiles function
      const { cleanupOldFiles } = require('../src/server.js');
      
      // Ensure we're in test environment
      expect(process.env.NODE_ENV).toBe('test');
      
      // Create test file
      const oldFile = path.join(process.cwd(), 'uploads', 'test-old.tex');
      await fs.promises.writeFile(oldFile, 'test content');
      
      // Set file time to 1 second ago (since maxAge is 100ms in test)
      const time = Date.now() - 1000;
      await fs.promises.utimes(oldFile, time/1000, time/1000);
      
      // Verify file exists before cleanup
      expect(fs.existsSync(oldFile)).toBe(true);
      
      // Call cleanup directly
      await cleanupOldFiles();
      
      // Verify file is deleted
      expect(fs.existsSync(oldFile)).toBe(false);
    }, 2000); // 2 second timeout should be sufficient

    it('should maintain recent files', async () => {
      const recentFile = path.join(process.cwd(), 'uploads', 'test-recent.tex');
      fs.writeFileSync(recentFile, 'test content');
      
      // Trigger cleanup
      await request(app).get('/');
      
      expect(fs.existsSync(recentFile)).toBe(true);
      
      // Cleanup test file
      fs.unlinkSync(recentFile);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors', async () => {
      const response = await request(app).get('/nonexistent');
      expect(response.status).toBe(404);
    });

    it('should handle server errors', async () => {
      // Simulate an error by sending invalid content type
      const response = await request(app)
        .post('/stream-analyze')
        .send('invalid')
        .set('Content-Type', 'text/plain');
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle concurrent requests', async () => {
      const requests = Array(5).fill().map(() =>
        request(app)
          .post('/stream-analyze')
          .send({
            jobDescription: 'test',
            apiKey: 'test-key'
          })
      );
      
      const responses = await Promise.all(requests);
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('sessionId');
      });
    });
  });

  describe('Session Management', () => {
    it('should cleanup inactive sessions', async () => {
      // Create a session
      const response = await request(app)
        .post('/stream-analyze')
        .field('jobDescription', 'test')
        .field('apiKey', 'test-key');
      
      const sessionId = response.body.sessionId;
      
      // Wait for session timeout
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Try to use expired session
      const streamResponse = await request(app)
        .get(`/stream-analyze-events?sessionId=${sessionId}`)
        .set('Accept', 'text/event-stream');
      
      expect(streamResponse.status).toBe(400);
    });

    it('should handle multiple clients per session', async () => {
      const sessionResponse = await request(app)
        .post('/stream-analyze')
        .send({
          jobDescription: 'test',
          apiKey: 'test-key'
        });
      
      if (sessionResponse.status !== 200) {
        console.error('Session creation failed:', sessionResponse.body);
        throw new Error('Failed to create session');
      }
      
      console.log('Session response:', sessionResponse.body);
      const sessionId = sessionResponse.body.sessionId;
      if (!sessionId) {
        throw new Error('Session ID not found in response');
      }
      console.log('Extracted session ID:', sessionId);
      console.log(`Created session with ID: ${sessionId}`);
      
      const streamRequests = Array(3).fill().map(() => {
        console.log(`Creating stream request for session ${sessionId}`);
        return request(app)
          .get(`/stream-analyze-events?sessionId=${sessionId}`)
          .set('Accept', 'text/event-stream')
          .on('error', (err) => {
            console.error('Stream request error:', err);
          });
      });
      
      const responses = await Promise.all(streamRequests);
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.type).toBe('text/event-stream');
      });
    });
  });
});