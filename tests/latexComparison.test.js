const fs = require('fs');
const { StreamHandler } = require('../public/js/streamingHandler');

// Add this test to frontend tests in jest.config.js
/**
 * @jest-environment jsdom
 */

describe('LaTeX Content Handling', () => {
    let streamHandler;
    let mockCallback;
    const sampleLatex = `\\documentclass[9pt]{article}
\\begin{document}
Test content
\\end{document}`;

    const modifiedLatex = `\\documentclass[9pt]{article}
\\begin{document}
Modified test content
\\end{document}`;

    beforeEach(() => {
        streamHandler = new StreamHandler();
        mockCallback = jest.fn();
    });

    test('validates and cleans LaTeX content', () => {
        const result = streamHandler.validateLatexContent(sampleLatex);
        expect(result.trim()).toBe('Test content');
    });

    test('handles LaTeX chunks correctly in processChunk', () => {
        streamHandler.processChunk(sampleLatex, mockCallback);
        expect(mockCallback).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.any(String),
                type: 'latex'
            })
        );
        const result = mockCallback.mock.calls[0][0];
        expect(result.content).toBe('Test content');
    });

    test('compares different LaTeX contents', () => {
        const originalCallback = jest.fn();
        const modifiedCallback = jest.fn();

        streamHandler.processChunk(sampleLatex, originalCallback);
        streamHandler.processChunk(modifiedLatex, modifiedCallback);

        const originalResult = originalCallback.mock.calls[0][0];
        const modifiedResult = modifiedCallback.mock.calls[0][0];

        expect(originalResult.type).toBe('latex');
        expect(modifiedResult.type).toBe('latex');
        expect(originalResult.content).not.toBe(modifiedResult.content);
    });

    test('handles real resume template', () => {
        const realResume = fs.readFileSync('./Resume-template.tex', 'utf8');
        const callback = jest.fn();

        streamHandler.processChunk(realResume, callback);

        const result = callback.mock.calls[0][0];
        expect(result).toEqual(expect.objectContaining({
            type: 'latex'
        }));

        // Verify key sections are preserved in the content
        const content = result.content;
        expect(content).toContain('Technical Expertise');
        expect(content).toContain('Software Development');
        expect(content).toContain('Systems Engineering');
        expect(content).toContain('SKILLS');
        expect(content).toContain('EXPERIENCE');
        expect(content).toContain('EDUCATION');
        
        // Verify LaTeX commands are removed
        expect(content).not.toContain('\\documentclass');
        expect(content).not.toContain('\\begin{document}');
        expect(content).not.toContain('\\end{document}');
    });
});