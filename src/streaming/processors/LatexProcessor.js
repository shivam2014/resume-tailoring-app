/**
 * LatexProcessor.js
 * Handles LaTeX content validation and processing
 */

export class LatexProcessor {
    /**
     * Validates and cleans LaTeX content
     * @param {string} content - LaTeX content to validate
     * @returns {string} - Cleaned LaTeX content
     */
    static cleanContent(content) {
        if (!content || typeof content !== 'string') {
            return '';
        }

        // Remove LaTeX preamble (everything before \begin{document})
        const mainContent = content.split('\\begin{document}')[1] || content;

        // Process the content in steps
        let processedContent = mainContent
            // Remove \end{document} and everything after it
            .split('\\end{document}')[0]
            // Remove comments
            .replace(/%[^\n]*/g, '')
            // Handle section titles - preserve them in uppercase
            .replace(/\\section\*?\{[^}]*\\textls\[50\]\{([^}]+)\}\}/g, (match, title) => `\n${title.toUpperCase()}\n`)
            // Handle itemize environments while preserving structure
            .replace(/\\begin\{itemize\}(.*?)\\end\{itemize\}/gs, '$1')
            // Handle item bullets with proper spacing
            .replace(/\\item\s*/g, '\n• ')
            // Extract text from textbf while preserving content
            .replace(/\\textbf\{([^}]+)\}/g, '$1')
            // Extract href content
            .replace(/\\href\{[^}]*\}\{([^}]+)\}/g, '$1')
            // Handle font size and spacing commands
            .replace(/\\fontsize\{[^}]+\}\{[^}]+\}/g, '')
            .replace(/\\textls\[[^\]]+\]/g, '')
            // Remove other LaTeX commands while preserving their content
            .replace(/\\[a-zA-Z]+(\[[^\]]*\])?(\{([^}]*)\})?/g, '$3')
            // Remove remaining LaTeX special characters
            .replace(/[{}\\]/g, '')
            // Normalize spaces and newlines
            .replace(/\s*\n\s*/g, '\n')
            .replace(/\s+/g, ' ')
            .trim();

        return processedContent;
    }

    /**
     * Extracts sections from LaTeX content
     * @param {string} text - LaTeX content to process
     * @returns {string} - Extracted sections
     */
    static extractSections(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }

        // Remove LaTeX preamble (everything before \begin{document})
        const mainContent = text.split('\\begin{document}')[1] || text;

        // Process the content in steps
        return mainContent
            // Remove \end{document} and everything after it
            .split('\\end{document}')[0]
            // Remove comments
            .replace(/%[^\n]*/g, '')
            // Handle section titles - preserve them in uppercase
            .replace(/\\section\*?\{[^}]*\\textls\[50\]\{([^}]+)\}\}/g, (match, title) => `\n${title.toUpperCase()}\n`)
            // Handle itemize environments while preserving structure
            .replace(/\\begin\{itemize\}(.*?)\\end\{itemize\}/gs, '$1')
            // Handle item bullets with proper spacing
            .replace(/\\item\s*/g, '\n• ')
            // Extract text from textbf while preserving content
            .replace(/\\textbf\{([^}]+)\}/g, '$1')
            // Extract href content
            .replace(/\\href\{[^}]*\}\{([^}]+)\}/g, '$1')
            // Handle font size and spacing commands
            .replace(/\\fontsize\{[^}]+\}\{[^}]+\}/g, '')
            .replace(/\\textls\[[^\]]+\]/g, '')
            // Remove other LaTeX commands while preserving their content
            .replace(/\\[a-zAZ]+(\[[^\]]*\])?(\{([^}]*)\})?/g, '$3')
            // Remove remaining LaTeX special characters
            .replace(/[{}\\]/g, '')
            // Normalize spaces and newlines
            .replace(/\s*\n\s*/g, '\n')
            .replace(/\s+/g, ' ')
            .trim();
    }
}