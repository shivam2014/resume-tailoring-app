import { DiffUtils, createDiffHtml, highlightLatexSyntax, extractTextFromLatex } from '../public/js/diffUtils.js';

describe('DiffUtils', () => {
  let diffUtils;
  
  beforeEach(() => {
    diffUtils = new DiffUtils();
  });

  describe('section extraction', () => {
    const sampleLatex = `
\\section{Skills}
Technical skills here
\\section{Experience}
Work experience here
    `;

    it('should extract sections from LaTeX', () => {
      const sections = diffUtils.extractSections(sampleLatex);
      expect(sections).toHaveProperty('Skills');
      expect(sections).toHaveProperty('Experience');
    });

    it('should maintain section content integrity', () => {
      const sections = diffUtils.extractSections(sampleLatex);
      expect(sections.Skills).toContain('Technical skills here');
      expect(sections.Experience).toContain('Work experience here');
    });
  });

  describe('diff visualization', () => {
    const originalText = 'Python JavaScript';
    const modifiedText = 'Python TypeScript JavaScript';

    it('should highlight word-level changes', () => {
      const diff = diffUtils.generateWordDiff(originalText, modifiedText);
      expect(diff).toContain('TypeScript');
      expect(diff).toContain('addition');
    });

    it('should preserve unchanged words', () => {
      const diff = diffUtils.generateWordDiff(originalText, modifiedText);
      expect(diff).toContain('Python');
      expect(diff).toContain('JavaScript');
    });
  });

  describe('section-based diff', () => {
    const original = {
      Skills: 'Python JavaScript',
      Experience: 'Software Engineer'
    };
    const modified = {
      Skills: 'Python TypeScript',
      Experience: 'Software Engineer'
    };

    it('should identify changed sections', () => {
      const changes = diffUtils.compareResumeSections(original, modified);
      expect(changes.Skills).toBeTruthy();
      expect(changes.Experience).toBeFalsy();
    });

    it('should track specific changes within sections', () => {
      const changes = diffUtils.compareResumeSections(original, modified);
      expect(changes.Skills).toContain('TypeScript');
      expect(changes.Skills).not.toContain('JavaScript');
    });
  });

  describe('LaTeX syntax handling', () => {
    const latexText = '\\textbf{Important} \\emph{emphasized}';

    it('should preserve LaTeX commands in diff', () => {
      const diff = diffUtils.generateLatexDiff(latexText, latexText + ' new');
      expect(diff).toContain('\\textbf');
      expect(diff).toContain('\\emph');
    });

    it('should handle LaTeX special characters', () => {
      const special = '\\% \\$ \\& \\_';
      const result = diffUtils.escapeLatexSpecialChars(special);
      expect(result).toMatch(/\\[%$&_]/);
    });
  });

  describe('change type identification', () => {
    it('should identify additions', () => {
      const changes = diffUtils.identifyChangeTypes('old', 'old new');
      expect(changes).toContain('addition');
    });

    it('should identify deletions', () => {
      const changes = diffUtils.identifyChangeTypes('old content', 'old');
      expect(changes).toContain('deletion');
    });

    it('should identify modifications', () => {
      const changes = diffUtils.identifyChangeTypes('old text', 'new text');
      expect(changes).toContain('modification');
    });
  });

  describe('LaTeX text extraction', () => {
    it('should extract plain text from simple LaTeX', () => {
      const latex = '\\textbf{Bold} and \\textit{italic} text';
      const result = extractTextFromLatex(latex);
      expect(result).toBe('Bold and italic text');
    });

    it('should handle sections and itemize environments', () => {
      const latex = `
        \\section{Skills}
        \\begin{itemize}
          \\item JavaScript
          \\item Python
        \\end{itemize}
      `;
      const result = extractTextFromLatex(latex);
      expect(result).toContain('Skills');
      expect(result).toContain('• JavaScript');
      expect(result).toContain('• Python');
    });

    it('should handle LaTeX commands with multiple arguments', () => {
      const latex = '\\fontsize{12}{14}\\selectfont Some text';
      const result = extractTextFromLatex(latex);
      expect(result).toBe('Some text');
    });

    it('should preserve meaningful whitespace', () => {
      const latex = '\\section{Experience}\\\\Senior Developer';
      const result = extractTextFromLatex(latex);
      expect(result).toMatch(/Experience\s+Senior Developer/);
    });
  });

  describe('Diff HTML generation', () => {
    it('should generate side-by-side diff view', async () => {
      const original = 'Text A';
      const modified = 'Text B';
      const result = await createDiffHtml(original, modified, 'side-by-side');
      expect(result).toContain('Text A');
      expect(result).toContain('Text B');
    });

    it('should handle empty inputs', async () => {
      const result = await createDiffHtml('', '', 'side-by-side');
      expect(result).toBeTruthy();
    });

    it('should detect and highlight changes', async () => {
      const original = 'Python developer';
      const modified = 'Senior Python developer';
      const result = await createDiffHtml(original, modified, 'side-by-side');
      expect(result).toContain('Senior');
      expect(result).toContain('Python developer');
    });

    it('should switch between LaTeX and readable text modes', async () => {
      const original = '\\textbf{Skills}';
      const modified = '\\textbf{Updated Skills}';
      
      const rawResult = await createDiffHtml(original, modified, 'side-by-side', false);
      expect(rawResult).toContain('\\textbf');
      
      const readableResult = await createDiffHtml(original, modified, 'side-by-side', true);
      expect(readableResult).not.toContain('\\textbf');
    });
  });

  describe('LaTeX syntax highlighting', () => {
    it('should highlight LaTeX commands', () => {
      const container = document.createElement('div');
      container.innerHTML = '\\textbf{bold}';
      highlightLatexSyntax(container);
      expect(container.innerHTML).toContain('tex-command');
    });

    it('should highlight command arguments', () => {
      const container = document.createElement('div');
      container.innerHTML = '\\section{Title}';
      highlightLatexSyntax(container);
      expect(container.innerHTML).toContain('tex-arg');
    });

    it('should handle nested commands', () => {
      const container = document.createElement('div');
      container.innerHTML = '\\begin{itemize}\\item{Text}\\end{itemize}';
      highlightLatexSyntax(container);
      const commandCount = (container.innerHTML.match(/tex-command/g) || []).length;
      expect(commandCount).toBeGreaterThan(1);
    });
  });

  describe('Section-based diff', () => {
    it('should identify changed sections', async () => {
      const original = `
        \\section{Skills}
        Python, JavaScript
        \\section{Experience}
        Developer
      `;
      const modified = `
        \\section{Skills}
        Python, TypeScript
        \\section{Experience}
        Developer
      `;
      const result = await createDiffHtml(original, modified, 'side-by-side', true);
      expect(result).toContain('Skills');
      expect(result).toContain('TypeScript');
    });

    it('should preserve section order', async () => {
      const sections = ['Summary', 'Skills', 'Experience', 'Education'];
      const original = sections.map(s => `\\section{${s}}\nContent`).join('\n');
      const modified = original;
      const result = await createDiffHtml(original, modified, 'side-by-side', true);
      
      let lastIndex = -1;
      sections.forEach(section => {
        const currentIndex = result.indexOf(section);
        expect(currentIndex).toBeGreaterThan(lastIndex);
        lastIndex = currentIndex;
      });
    });

    it('should handle section removals', async () => {
      const original = `
        \\section{Skills}
        Content
        \\section{Projects}
        Content
      `;
      const modified = `
        \\section{Skills}
        Content
      `;
      const result = await createDiffHtml(original, modified, 'side-by-side', true);
      expect(result).toContain('Projects');
      expect(result).toContain('deletion');
    });
  });

  describe('Error handling', () => {
    it('should handle malformed LaTeX', async () => {
      const malformed = '\\begin{document';
      expect(async () => {
        await createDiffHtml(malformed, malformed, 'side-by-side');
      }).not.toThrow();
    });

    it('should provide fallback for diff generation failures', async () => {
      // Mock diff2html failure
      const original = 'text';
      const modified = 'text modified';
      const result = await createDiffHtml(original, modified, 'invalid-view-type');
      expect(result).toContain('text');
      expect(result).toContain('modified');
    });

    it('should handle syntax highlighting errors', () => {
      const container = document.createElement('div');
      container.innerHTML = '\\invalid{';
      expect(() => highlightLatexSyntax(container)).not.toThrow();
    });
  });
});