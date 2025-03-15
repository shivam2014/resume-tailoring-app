// @ts-nocheck
// Use global Diff object from script tag instead of Node.js module
// createTwoFilesPatch will be accessed via window.Diff

// Variables for diff2html functions
let html, parse;

// Skip ESM imports for diff2html and use global objects instead
async function initDiff2Html() {
    // For Jest environment, provide mock implementations
    if (typeof window === 'undefined') {
        html = (diff, options) => `<div class="mock-diff-html">${diff}</div>`;
        parse = (diff) => diff;
        return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
        // Check if already loaded via script tag
        if (window.Diff2Html) {
            html = window.Diff2Html.html;
            parse = window.Diff2Html.parse;
            console.log('Using pre-loaded Diff2Html from global scope');
            resolve();
            return;
        }

        console.log('Loading Diff2Html from CDN');
        // If not loaded, create a script element
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/diff2html@3.4.35/bundles/js/diff2html.min.js';
        script.onload = () => {
            // Access the global object after it's loaded
            if (window.Diff2Html) {
                html = window.Diff2Html.html;
                parse = window.Diff2Html.parse;
                console.log('Successfully loaded Diff2Html from CDN');
                resolve();
            } else {
                console.error('Diff2Html loaded but global object not available');
                reject(new Error('Diff2Html global object not available after script load'));
            }
        };
        script.onerror = (err) => {
            console.error('Failed to load Diff2Html script:', err);
            reject(err);
        };
        
        // Append to document head
        document.head.appendChild(script);
    });
}

import { LatexASTAdapter } from './LatexASTAdapter.js';

/**
 * DiffUtils class for handling LaTeX diff operations
 */
class DiffUtils {
    /**
     * Extract sections from LaTeX content using AST
     * @param {string} latexContent - The LaTeX content to parse
     * @returns {Promise<Object>} - Object containing sections and their content
     */
    // Generate word-level diff highlighting
    generateWordDiff(original, modified) {
        const diff = require('diff');
        const changes = diff.diffWords(original, modified);
        return changes.map(change => {
            if (change.added) {
                return `<span class="addition">${change.value}</span>`;
            }
            if (change.removed) {
                return `<span class="deletion">${change.value}</span>`;
            }
            return change.value;
        }).join('');
    }

    // Compare resume sections and identify changes
    compareResumeSections(original, modified) {
        const changes = {};
        for (const [section, content] of Object.entries(modified)) {
            if (!original[section] || original[section] !== content) {
                changes[section] = this.generateWordDiff(
                    original[section] || '',
                    content
                );
            }
        }
        return changes;
    }

    // Generate LaTeX-specific diff
    generateLatexDiff(original, modified) {
        const diff = require('diff');
        return diff.diffLines(original, modified)
            .map(part => part.value)
            .join('');
    }

    // Escape special LaTeX characters
    escapeLatexSpecialChars(text) {
        return text.replace(/([%$&_])/g, '\\$1');
    }

    // Identify types of changes between texts
    identifyChangeTypes(original, modified) {
        const diff = require('diff');
        const changes = new Set();
        const diffs = diff.diffWords(original, modified);
        
        diffs.forEach(part => {
            if (part.added) changes.add('addition');
            if (part.removed) changes.add('deletion');
            if (part.value && !part.added && !part.removed) changes.add('modification');
        });
        
        return Array.from(changes);
    }

    async extractSections(latexContent) {
        const sections = {};
        
        // Get raw AST from worker
        const ast = await new Promise((resolve, reject) => {
            if (!window.latexWorker) {
                window.latexWorker = new Worker('/js/latexWorker.js');
            }
            
            window.latexWorker.postMessage(latexContent);
            window.latexWorker.onmessage = function(event) {
                if (event.data.status === 'error') {
                    reject(new Error(event.data.error));
                } else {
                    resolve(event.data.ast);
                }
            };
            window.latexWorker.onerror = function(error) {
                reject(error);
            };
        });
        
        // Traverse AST to find sections
        const traverse = (node) => {
            if (node.type === 'command' && (node.name === 'section' || node.name === 'section*')) {
                const sectionName = node.args[0].content.trim();
                const content = [];
                
                // Collect content from next siblings until next section
                let nextNode = node.nextSibling;
                while (nextNode && !(nextNode.type === 'command' &&
                      (nextNode.name === 'section' || nextNode.name === 'section*'))) {
                    if (nextNode.type === 'text') {
                        content.push(nextNode.content);
                    } else if (nextNode.type === 'command' && nextNode.name === 'item') {
                        // Handle itemize environments
                        content.push(`• ${nextNode.args[0].content.trim()}`);
                    }
                    nextNode = nextNode.nextSibling;
                }
                
                sections[sectionName] = content.join('\n').trim();
            }
            
            // Traverse child nodes if they exist
            if (node.content && Array.isArray(node.content)) {
                node.content.forEach(child => traverse(child));
            }
            
            // Continue traversal through next siblings
            if (node.nextSibling) {
                traverse(node.nextSibling);
            }
        };
        
        traverse(ast);
        return sections;
    }

    // ... (other class methods)
}

// Helper function to convert AST to readable text
function astToString(node) {
    if (!node) {
        return '';
    }

    if (node.type === 'text') {
        return node.content;
    }

    if (node.type === 'command') {
        // Handle specific LaTeX commands
        switch (node.name) {
            case 'textbf':
            case 'textit':
            case 'emph':
                // For text formatting commands, just return their content
                return node.args ? node.args.map(astToString).join(' ') : '';
            case 'section':
            case 'section*':
                // For sections, include both the title and content
                const title = node.args ? node.args.map(astToString).join(' ') : '';
                const content = node.nextSibling ? astToString(node.nextSibling) : '';
                return `${title}\n${content}`;
            default:
                // For other commands, just process their arguments
                return node.args ? node.args.map(astToString).join(' ') : '';
        }
    }

    if (node.content && Array.isArray(node.content)) {
        return node.content.map(astToString).join(' ');
    }

    return '';
}

// Function to create diff HTML
async function createDiffHtml(originalText, modifiedText, viewType = 'side-by-side', useTextMode = false) {
    // ... (implementation)
}

// Function to highlight LaTeX syntax
function highlightLatexSyntax(container) {
    // ... (implementation)
}

// Function to extract text from LaTeX
async function extractTextFromLatex(latexCode) {
    console.log('extractTextFromLatex called with:', latexCode);
    return new Promise((resolve, reject) => {
        if (!window.latexWorker) {
            console.log('Creating new latexWorker');
            window.latexWorker = new Worker('/js/latexWorker.js');
        }
        
        window.latexWorker.postMessage(latexCode);
        window.latexWorker.onmessage = function(event) {
            console.log('Received worker message:', event.data);
            if (event.data.status === 'error') {
                reject(new Error(event.data.error));
            } else {
                const ast = event.data.ast;
                console.log('Parsing AST:', ast);
                const text = astToString(ast);
                console.log('Extracted text:', text);
                resolve(text);
            }
        };
        window.latexWorker.onerror = function(error) {
            console.error('Worker error:', error);
            reject(error);
        };
    });
}


// Load diff2html for the browser environment
if (typeof window !== 'undefined') {
    try {
        initDiff2Html();
    } catch (error) {
        console.error('Failed to initialize diff2html:', error);
    }
}

export { DiffUtils, createDiffHtml, highlightLatexSyntax, extractTextFromLatex };