import { jest } from '@jest/globals';
import { MistralHelper } from '../src/mistralHelper.js';

describe('MistralHelper', () => {
  let mistralHelper;
  const mockApiKey = 'test-api-key';
  
  let mockNonStreamingResponse;

  beforeEach(() => {
    mistralHelper = new MistralHelper(mockApiKey);
    
    mockNonStreamingResponse = {
      data: {
        choices: [{
          message: {
            content: JSON.stringify({
              technicalSkills: ['Python', 'JavaScript'],
              softSkills: ['Communication'],
              experience: ['5+ years experience']
            })
          }
        }]
      }
    };

    // Setup default successful mocks
    jest.spyOn(mistralHelper.client, 'post').mockImplementation(async (url, data) => {
      if (data.stream) {
        // Create a new stream for each request
        const { Readable } = require('stream');
        const stream = new Readable({
          read() {} // Required but empty since we'll push data manually
        });

        const streamResponse = { data: stream };

        // Push data in the next tick to ensure handlers are attached
        process.nextTick(() => {
          const isAnalyze = data.messages.some(m => m.content.includes('[JOB_DESCRIPTION]'));
          if (isAnalyze) {
            stream.push(Buffer.from(`data: ${JSON.stringify({
              id: "test",
              object: "chat.completion.chunk",
              created: Date.now(),
              model: "mistral-small-latest",
              choices: [{
                index: 0,
                delta: { content: '{"technicalSkills":["Python","JavaScript"],"softSkills":["Communication"],"experience":["5+ years"]}' }
              }]
            })}\n\n`));
          } else {
            stream.push(Buffer.from(`data: ${JSON.stringify({
              id: "test",
              object: "chat.completion.chunk",
              created: Date.now(),
              model: "mistral-small-latest",
              choices: [{
                index: 0,
                delta: { content: '\\section{Skills}\\n\\begin{itemize}\\n\\item \\textbf{Python}\\n\\item JavaScript\\n\\end{itemize}' }
              }]
            })}\n\n`));
          }

          stream.push(Buffer.from('data: [DONE]\n\n'));
          stream.push(null);
        });

        return Promise.resolve(streamResponse);
      }
      return Promise.resolve(mockNonStreamingResponse);
    });
  });

  describe('analyzeJobDescription', () => {
    const sampleJobDesc = `Simulator Systems Engineer
    Key responsibilities:
    - Debugging avionics and aircraft system deficiencies
    - Tuning subjective observations raised by instructors.`;

    it('should extract structured requirements from job description', async () => {
      const result = await mistralHelper.analyzeJobDescription(sampleJobDesc);
      expect(result).toHaveProperty('technicalSkills');
      expect(result).toHaveProperty('softSkills');
      expect(result).toHaveProperty('experience');
    });

    it('should handle empty job descriptions', async () => {
      // Override mock for empty input
      jest.spyOn(mistralHelper.client, 'post').mockResolvedValueOnce({
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                technicalSkills: [],
                softSkills: [],
                experience: [],
                education: [],
                keyResponsibilities: [],
                preferredQualifications: [],
                industryKnowledge: [],
                toolsAndPlatforms: []
              })
            }
          }]
        }
      });
      
      const result = await mistralHelper.analyzeJobDescription('');
      expect(result).toHaveProperty('technicalSkills', []);
    });

    it('should handle API errors gracefully', async () => {
      // Simulate API error
      jest.spyOn(mistralHelper.client, 'post').mockRejectedValue(new Error('API Error'));
      await expect(mistralHelper.analyzeJobDescription(sampleJobDesc)).rejects.toThrow('API Error');
    });
  });

  describe('streamAnalyzeJobDescription', () => {
    it('should handle JSON structure tracking', async () => {
      const chunks = [];
      const onChunk = jest.fn(chunk => chunks.push(chunk));
      const onComplete = jest.fn();
      const onError = jest.fn();

      const stream = new (require('stream').Readable)({
        read() {}
      });

      jest.spyOn(mistralHelper.client, 'post').mockImplementation(() => {
        return Promise.resolve({ data: stream });
      });

      const streamPromise = new Promise((resolve, reject) => {
        mistralHelper.streamAnalyzeJobDescription(
          'test job',
          onChunk,
          (parsedJson) => {
            onComplete(parsedJson);
            resolve();
          },
          (error) => {
            onError(error);
            reject(error);
          }
        );
      });

      // Push data after the handlers are set up
      process.nextTick(() => {
        stream.push(Buffer.from(`data: ${JSON.stringify({
          id: "test",
          object: "chat.completion.chunk",
          created: Date.now(),
          model: "mistral-small-latest",
          choices: [{
            index: 0,
            delta: { content: '{"technicalSkills":["Python"]}' }
          }]
        })}\n\n`));
        
        stream.push(Buffer.from('data: [DONE]\n\n'));
        stream.push(null);
      });

      await streamPromise;

      expect(chunks.length).toBeGreaterThan(0);
      expect(onComplete).toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it('should handle malformed JSON responses', async () => {
      const onChunk = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();
      
      const { Readable } = require('stream');
      const stream = new Readable({
        read() {}
      });
      
      jest.spyOn(mistralHelper.client, 'post').mockImplementation(() => {
        return Promise.resolve({
          data: stream
        });
      });

      const streamPromise = new Promise((resolve) => {
        mistralHelper.streamAnalyzeJobDescription('test job', onChunk, onComplete, (error) => {
          onError(error);
          resolve();
        });
      });

      // Push malformed data after handlers are set up
      process.nextTick(() => {
        stream.push(Buffer.from(`data: ${JSON.stringify({
          id: "test",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { content: '{malformed json' } }]
        })}\n\n`));
        stream.push(Buffer.from('data: [DONE]\n\n'));
        stream.push(null);
      });

      await streamPromise;
      
      expect(onError).toHaveBeenCalledWith(
        expect.stringContaining('Error parsing job requirements')
      );
    });

    it('should handle stream interruptions', async () => {
      const onChunk = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      // Simulate stream error
      jest.spyOn(mistralHelper.client, 'post').mockRejectedValue(new Error('Stream interrupted'));

      await mistralHelper.streamAnalyzeJobDescription('test job', onChunk, onComplete, onError);
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('Stream was interrupted, possibly due to network issues'));
    });
  });

  describe('latexToPlainText', () => {
    it('should convert LaTeX to readable text', () => {
      const latex = '\\textbf{Test} \\emph{content}';
      const result = mistralHelper.latexToPlainText(latex);
      expect(result).toBe('Test content');
    });

    it('should handle complex LaTeX structures', () => {
      const complexLatex = `
        \\section{Skills}
        \\begin{itemize}
          \\item Skill 1
          \\item Skill 2
        \\end{itemize}
      `;
      const result = mistralHelper.latexToPlainText(complexLatex);
      expect(result).toContain('Skills');
      expect(result).toContain('• Skill 1');
      expect(result).toContain('• Skill 2');
    });

    it('should handle LaTeX special characters', () => {
      const specialChars = '\\% \\$ \\& \\_';
      const result = mistralHelper.latexToPlainText(specialChars);
      expect(result).not.toContain('\\');
    });
  });

  describe('streamTailorResume', () => {
    const sampleLatex = '\\section{Skills}\nTest skills';
    const requirements = {
      technicalSkills: ['Python', 'JavaScript'],
      softSkills: ['Communication']
    };

    // Note: No beforeEach needed as streaming is handled in the post mock

    it('should preserve LaTeX structure and emphasize matching skills', async () => {
      const onChunk = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      const stream = new (require('stream').Readable)({
        read() {}
      });

      jest.spyOn(mistralHelper.client, 'post').mockImplementation(() => {
        return Promise.resolve({ data: stream });
      });

      const streamPromise = new Promise((resolve, reject) => {
        mistralHelper.streamTailorResume(
          sampleLatex,
          requirements,
          onChunk,
          (result) => {
            onComplete(result);
            resolve();
          },
          (error) => {
            onError(error);
            reject(error);
          }
        );
      });

      // Push LaTeX content after handlers are set up
      process.nextTick(() => {
        stream.push(Buffer.from(`data: ${JSON.stringify({
          id: "test",
          object: "chat.completion.chunk",
          created: Date.now(),
          model: "mistral-small-latest",
          choices: [{
            index: 0,
            delta: { content: '\\section{Skills}\\n\\begin{itemize}\\n\\item \\textbf{Python}\\n\\item JavaScript\\n\\end{itemize}' }
          }]
        })}\n\n`));
        
        stream.push(Buffer.from('data: [DONE]\n\n'));
        stream.push(null);
      });

      await streamPromise;

      expect(onComplete).toHaveBeenCalledWith(expect.stringContaining('\\section'));
      expect(onComplete).toHaveBeenCalledWith(expect.stringContaining('Python'));
      expect(onComplete).toHaveBeenCalledWith(expect.stringContaining('JavaScript'));
      expect(onError).not.toHaveBeenCalled();
    });

    it('should handle empty requirements', async () => {
      const onChunk = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      const stream = new (require('stream').Readable)({
        read() {}
      });

      jest.spyOn(mistralHelper.client, 'post').mockImplementation(() => {
        return Promise.resolve({ data: stream });
      });

      const streamPromise = new Promise((resolve, reject) => {
        mistralHelper.streamTailorResume(
          sampleLatex,
          {},
          onChunk,
          (result) => {
            onComplete(result);
            resolve();
          },
          (error) => {
            onError(error);
            reject(error);
          }
        );
      });

      // Simulate empty requirements response
      process.nextTick(() => {
        stream.push(Buffer.from(`data: ${JSON.stringify({
          id: "test",
          object: "chat.completion.chunk",
          created: Date.now(),
          model: "mistral-small-latest",
          choices: [{
            index: 0,
            delta: { content: sampleLatex }
          }]
        })}\n\n`));
        
        stream.push(Buffer.from('data: [DONE]\n\n'));
        stream.push(null);
      });

      await streamPromise;

      expect(onError).not.toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalled();
    });
  });
});