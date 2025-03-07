import { jest } from '@jest/globals';
import { MistralHelper } from '../src/mistralHelper.js';

describe('MistralHelper', () => {
  let mistralHelper;
  const mockApiKey = 'test-api-key';
  
  beforeEach(() => {
    mistralHelper = new MistralHelper(mockApiKey);
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

      await mistralHelper.streamAnalyzeJobDescription('test job', onChunk, onComplete, onError);
      expect(chunks.length).toBeGreaterThan(0);
      expect(onComplete).toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it('should handle malformed JSON responses', async () => {
      const onChunk = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      // Simulate malformed JSON response
      jest.spyOn(mistralHelper.client, 'post').mockResolvedValue({
        data: { choices: [{ delta: { content: '{malformed json' } }] }
      });

      await mistralHelper.streamAnalyzeJobDescription('test job', onChunk, onComplete, onError);
      expect(onError).toHaveBeenCalled();
    });

    it('should handle stream interruptions', async () => {
      const onChunk = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      // Simulate stream error
      jest.spyOn(mistralHelper.client, 'post').mockRejectedValue(new Error('Stream interrupted'));

      await mistralHelper.streamAnalyzeJobDescription('test job', onChunk, onComplete, onError);
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('Stream interrupted'));
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

    it('should preserve LaTeX structure while tailoring content', async () => {
      const onChunk = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      await mistralHelper.streamTailorResume(sampleLatex, requirements, onChunk, onComplete, onError);
      expect(onComplete).toHaveBeenCalledWith(expect.stringContaining('\\section'));
    });

    it('should emphasize matching skills', async () => {
      const onChunk = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      await mistralHelper.streamTailorResume(sampleLatex, requirements, onChunk, onComplete, onError);
      requirements.technicalSkills.forEach(skill => {
        expect(onComplete).toHaveBeenCalledWith(expect.stringContaining(skill));
      });
    });

    it('should handle empty requirements', async () => {
      const onChunk = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      await mistralHelper.streamTailorResume(sampleLatex, {}, onChunk, onComplete, onError);
      expect(onError).not.toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalled();
    });
  });
});