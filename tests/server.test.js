import request from 'supertest';
import { app } from '../src/server.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Server Integration Tests', () => {
  const testResumePath = path.join(__dirname, 'fixtures', 'test-resume.tex');
  
  beforeAll(() => {
    // Create test fixtures directory and sample resume
    if (!fs.existsSync(path.join(__dirname, 'fixtures'))) {
      fs.mkdirSync(path.join(__dirname, 'fixtures'));
    }
    fs.writeFileSync(testResumePath, '\\section{Skills}\nTest skills');
  });

  afterAll(() => {
    // Cleanup test files
    if (fs.existsSync(testResumePath)) {
      fs.unlinkSync(testResumePath);
    }
    if (fs.existsSync(path.join(__dirname, 'fixtures'))) {
      fs.rmdirSync(path.join(__dirname, 'fixtures'));
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
      const response = await request(app)
        .post('/stream-analyze')
        .field('jobDescription', jobDescription)
        .field('apiKey', mockApiKey);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sessionId');
    });

    it('should establish SSE connection', async () => {
      const sessionResponse = await request(app)
        .post('/stream-analyze')
        .field('jobDescription', jobDescription)
        .field('apiKey', mockApiKey);
      
      const sessionId = sessionResponse.body.sessionId;
      const response = await request(app)
        .get(`/stream-analyze-events?sessionId=${sessionId}`)
        .set('Accept', 'text/event-stream');
      
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
      const response = await request(app)
        .post('/stream-tailor')
        .attach('resumeFile', testResumePath)
        .field('requirements', JSON.stringify({
          technicalSkills: ['test skill'],
          softSkills: ['communication']
        }))
        .field('apiKey', 'test-api-key');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sessionId');
    });

    it('should validate resume file type', async () => {
      const response = await request(app)
        .post('/stream-tailor')
        .attach('resume', Buffer.from('invalid'), 'test.txt')
        .field('requirements', JSON.stringify({}));
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle missing requirements', async () => {
      const response = await request(app)
        .post('/stream-tailor')
        .attach('resumeFile', testResumePath)
        .field('apiKey', 'test-api-key');
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PDF Generation', () => {
    const validLatex = '\\documentclass{article}\\begin{document}Test\\end{document}';

    it('should generate PDF from valid LaTeX', async () => {
      const response = await request(app)
        .post('/generate-pdf')
        .send({ content: validLatex });
      
      expect(response.status).toBe(200);
      expect(response.type).toBe('application/pdf');
    });

    it('should handle LaTeX compilation errors', async () => {
      const response = await request(app)
        .post('/generate-pdf')
        .send({ content: '\\invalid{content}' });
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('latexLog');
    });

    it('should handle missing content', async () => {
      const response = await request(app)
        .post('/generate-pdf')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('File Management', () => {
    it('should clean up old files', async () => {
      const oldFile = path.join(process.cwd(), 'uploads', 'test-old.tex');
      fs.writeFileSync(oldFile, 'test content');
      
      // Set file time to 25 hours ago
      const time = Date.now() - (25 * 60 * 60 * 1000);
      fs.utimesSync(oldFile, time/1000, time/1000);
      
      // Trigger cleanup by making a request
      await request(app).get('/');
      
      expect(fs.existsSync(oldFile)).toBe(false);
    });

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
          .field('jobDescription', 'test')
          .field('apiKey', 'test-key')
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
        .field('jobDescription', 'test')
        .field('apiKey', 'test-key');
      
      const sessionId = sessionResponse.body.sessionId;
      
      const streamRequests = Array(3).fill().map(() => 
        request(app)
          .get(`/stream-analyze-events?sessionId=${sessionId}`)
          .set('Accept', 'text/event-stream')
      );
      
      const responses = await Promise.all(streamRequests);
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.type).toBe('text/event-stream');
      });
    });
  });
});