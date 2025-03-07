// Use specific imports to avoid the Template constructor error
import { createTwoFilesPatch } from 'https://cdn.jsdelivr.net/npm/diff@5.1.0/+esm';

// Variables for diff2html functions
let html, parse;

// Skip ESM imports for diff2html and use global objects instead
async function initDiff2Html() {
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

// Load diff2html
await initDiff2Html();

// Helper function to extract readable text from LaTeX code
function extractTextFromLatex(latexCode) {
    if (!latexCode) return '';
    
    // Initialize sections object
    const sections = {
        name: '',
        contact: '',
        summary: '',
        skills: [],
        experience: [],
        education: [],
        professionalDevelopment: [],
        publications: []
    };
    
    let text = latexCode;
    
    // Remove comments and preamble
    text = text.replace(/%.*/g, '');
    const documentMatch = text.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
    if (documentMatch && documentMatch[1]) {
        text = documentMatch[1];
    }
    
    // Extract name
    const namePattern = /\\centerline\{[^}]*\\fontfamily\{[^}]*\}[^}]*\\textbf\{[^}]*\\fontsize\{\d+\.\d+\}\{\d+\}\\selectfont\\textls\[\d+\]\{([A-Z])\}[^}]*\\fontsize\{\d+\.\d+\}\{\d+\}\\selectfont\\textls\[\d+\]\{([A-Za-z]+)\}[^}]*\\fontsize\{\d+\.\d+\}\{\d+\}\\selectfont\\textls\[\d+\]\{([A-Z])\}[^}]*\\fontsize\{\d+\.\d+\}\{\d+\}\\selectfont\\textls\[\d+\]\{([A-Za-z]+)\}[^}]*\}\}/;
    const nameMatch = text.match(namePattern);
    if (nameMatch) {
        sections.name = `${nameMatch[1]}${nameMatch[2]} ${nameMatch[3]}${nameMatch[4]}`;
    }
    
    // Extract contact info
    const contactPattern = /\\centerline\{([^}]+)\}/;
    const contactMatch = text.match(contactPattern);
    if (contactMatch) {
        sections.contact = contactMatch[1]
            .replace(/\\href\{mailto:([^}]+)\}\{([^}]+)\}/g, '$2')
            .replace(/\\href\{([^}]+)\}\{([^}]+)\}/g, '$2')
            .replace(/\s*\|\s*/g, ' | ')
            .trim();
    }
    
    // Extract summary (text between contact info and first section)
    const summaryPattern = /\\centerline\{[^}]+\}\s*(?:\\vspace\{[^}]*\}\s*)*\n\s*(.*?)\\section/s;
    const summaryMatch = text.match(summaryPattern);
    if (summaryMatch) {
        sections.summary = summaryMatch[1].trim();
    }
    
    // Split text into sections
    const sectionPattern = /\\section\*\{(?:[^{}]*\\fontsize\{[^{}]*\}[^{}]*\\textls\[\d+\]\{([A-Z])\}[^{}]*\\textls\[\d+\]\{([A-Za-z\s]+)\}|([^{}]*))\}([\s\S]*?)(?=\\section|\s*\\end\{document\})/g;
    let match;
    
    while ((match = sectionPattern.exec(text)) !== null) {
        const sectionName = match[3] || `${match[1]}${match[2]}`;
        let content = match[4];
        
        // Process itemize environments
        content = content.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (m, items) => {
            return items
                .split('\\item')
                .filter(item => item.trim())
                .map(item => '• ' + item.trim()
                    .replace(/\\textbf\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$1')
                    .replace(/\\textit\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$1')
                    .replace(/\\emph\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$1')
                    .replace(/\\\\/g, '\n')
                    .replace(/\\,/g, ' ')
                    .replace(/\s*--\s*/g, ' - ')
                    .replace(/\{|\}/g, '')
                    .replace(/[ \t]+/g, ' ')
                    .trim())
                .join('\n');
        });
        
        // Clean up content
        content = content
            .replace(/\\textbf\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$1')
            .replace(/\\textit\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$1')
            .replace(/\\emph\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$1')
            .replace(/\\hfill/g, ' - ')
            .replace(/\\vspace\{[^{}]*\}/g, '\n')
            .replace(/\\\\/g, '\n')
            .replace(/\\,/g, ' ')
            .replace(/\s*--\s*/g, ' - ')
            .replace(/\{|\}/g, '')
            .replace(/[ \t]+/g, ' ')
            .trim();
        
        // Add content to appropriate section
        switch (sectionName.toUpperCase()) {
            case 'SKILLS':
                sections.skills = content.split('\n').filter(line => line.trim());
                break;
            case 'EXPERIENCE':
                sections.experience = content.split('\n\n').filter(block => block.trim());
                break;
            case 'EDUCATION':
                sections.education = content.split('\n').filter(line => line.trim());
                break;
            case 'PROFESSIONAL DEVELOPMENT & LANGUAGES':
                sections.professionalDevelopment = content.split('\n').filter(line => line.trim());
                break;
            case 'PUBLICATIONS':
                sections.publications = content.split('\n').filter(line => line.trim());
                break;
        }
    }

    // Format the output as human-readable text with clear section separation
    let output = [];
    if (sections.name) output.push(`Name:\n${sections.name}\n`);
    if (sections.contact) output.push(`Contact Information:\n${sections.contact}\n`);
    if (sections.summary) output.push(`Summary:\n${sections.summary}\n`);
    if (sections.skills.length) output.push(`Skills:\n${sections.skills.join('\n')}\n`);
    if (sections.experience.length) output.push(`Experience:\n${sections.experience.join('\n\n')}\n`);
    if (sections.education.length) output.push(`Education:\n${sections.education.join('\n')}\n`);
    if (sections.professionalDevelopment.length) output.push(`Professional Development & Languages:\n${sections.professionalDevelopment.join('\n')}\n`);
    if (sections.publications.length) output.push(`Publications:\n${sections.publications.join('\n')}\n`);

    return output.join('\n');
}

// Helper function to wrap text in section div with appropriate class
function wrapInSection(text, sectionName, className) {
    return `<div class="${className}">
        <h2>${sectionName}</h2>
        ${text}
    </div>`;
}

// Helper function to transform raw text into sectioned HTML
function createSectionedHTML(sections, otherSections = null) {
    let html = [];
    const sectionKeys = ['name', 'contact', 'summary', 'skills', 'experience', 'education', 'professionalDevelopment', 'publications'];
    
    for (const key of sectionKeys) {
        if (!sections[key]) continue;
        
        let content = '';
        if (Array.isArray(sections[key])) {
            if (otherSections && otherSections[key]) {
                content = sections[key].map((text, i) => {
                    const otherText = otherSections[key][i];
                    return otherText ? highlightChanges(otherText, text) : text;
                }).join('\n');
            } else {
                content = sections[key].join('\n');
            }
        } else {
            content = otherSections ? 
                highlightChanges(otherSections[key], sections[key]) : 
                sections[key];
        }
        
        html.push(wrapInSection(content, {
            name: 'Name',
            contact: 'Contact Information',
            summary: 'Summary',
            skills: 'Skills',
            experience: 'Experience',
            education: 'Education',
            professionalDevelopment: 'Professional Development & Languages',
            publications: 'Publications'
        }[key], `section-${key}`));
    }
    
    return html.join('\n');
}

// Helper function to extract sections from text
function extractSections(text) {
    // Initialize sections object
    const sections = {
        name: '',
        contact: '',
        summary: '',
        skills: [],
        experience: [],
        education: [],
        professionalDevelopment: [],
        publications: []
    };
    
    // Split into lines and process
    const lines = text.split('\n');
    let currentSection = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Check for section headers
        if (line.startsWith('Name:')) {
            currentSection = 'name';
            continue;
        } else if (line.startsWith('Contact Information:')) {
            currentSection = 'contact';
            continue;
        } else if (line.startsWith('Summary:')) {
            currentSection = 'summary';
            continue;
        } else if (line.startsWith('Skills:')) {
            currentSection = 'skills';
            continue;
        } else if (line.startsWith('Experience:')) {
            currentSection = 'experience';
            continue;
        } else if (line.startsWith('Education:')) {
            currentSection = 'education';
            continue;
        } else if (line.startsWith('Professional Development & Languages:')) {
            currentSection = 'professionalDevelopment';
            continue;
        } else if (line.startsWith('Publications:')) {
            currentSection = 'publications';
            continue;
        }
        
        // Add content to current section
        if (currentSection) {
            if (typeof sections[currentSection] === 'string') {
                sections[currentSection] = line;
            } else {
                sections[currentSection].push(line);
            }
        }
    }
    
    return sections;
}

export async function createDiffHtml(originalText, modifiedText, viewType = 'side-by-side', useTextMode = false) {
    // Ensure diff2html is loaded
    if (!html || !parse) {
        await initDiff2Html();
    }
    
    try {
        // Check if we're dealing with LaTeX content
        const isLatexContent = originalText && (
            originalText.includes('\\documentclass') || 
            originalText.includes('\\begin{document}') ||
            modifiedText?.includes('\\documentclass') ||
            modifiedText?.includes('\\begin{document}')
        );
        
        // Always store raw content for LaTeX files
        if (isLatexContent) {
            window.rawOriginalContent = originalText;
            window.rawModifiedContent = modifiedText;
        }
        
        // Create two versions of the content - raw and extracted text
        let contentToCompare;
        
        if (isLatexContent) {
            if (useTextMode) {
                // Extract text and sections from both versions
                const originalTextOnly = extractTextFromLatex(originalText);
                const modifiedTextOnly = extractTextFromLatex(modifiedText);
                
                // Extract sections from the text
                const originalSections = extractSections(originalTextOnly);
                const modifiedSections = extractSections(modifiedTextOnly);
                
                // Create HTML with sections and change highlighting
                const originalHTML = createSectionedHTML(originalSections);
                const modifiedHTML = createSectionedHTML(modifiedSections, originalSections);
                
                contentToCompare = `
                    <div class="simple-diff-container with-sections">
                        <div class="simple-diff-header">
                            <div class="simple-diff-header-left">Original Resume</div>
                            <div class="simple-diff-header-right">Modified Resume</div>
                        </div>
                        <div class="simple-diff-content">
                            <div class="simple-diff-left">
                                <div class="simple-diff-text">${originalHTML}</div>
                            </div>
                            <div class="simple-diff-right">
                                <div class="simple-diff-text">${modifiedHTML}</div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                // Use raw LaTeX when not in text mode
                contentToCompare = createSimpleTextDiff(originalText, modifiedText, null, null);
            }
            
            // Add info message about the current mode
            return `
                <div class="diff-info-bar">
                    <p>${useTextMode ? 
                        "Showing human-readable text extracted from LaTeX. Raw LaTeX code will be used when editing." : 
                        "Showing raw LaTeX code. Click 'Show Readable Text' to see extracted human-readable text."}</p>
                </div>
                ${contentToCompare}
            `;
        }
        
        // For non-LaTeX content, use diff2html
        const diffPatch = createTwoFilesPatch(
            'Original Resume',
            'Modified Resume',
            originalText || '',
            modifiedText || ''
        );

        // Convert to HTML using diff2html
        return html(parse(diffPatch), {
            drawFileList: false,
            matching: 'lines',
            outputFormat: viewType,
            renderNothingWhenEmpty: false
        });
    } catch (error) {
        console.error('Error creating diff:', error);
        // Fallback to simple text comparison if diff2html fails
        return createSimpleTextDiff(originalText, modifiedText);
    }
}

// Create a simple text-based diff with proper line wrapping
function createSimpleTextDiff(originalText, modifiedText, rawOriginal = null, rawModified = null) {
    // Store raw content for edit button functionality
    const hasRawContent = rawOriginal !== null && rawModified !== null;
    if (hasRawContent) {
        window.rawOriginalContent = rawOriginal;
        window.rawModifiedContent = rawModified;
    }

    // Check if either text contains job requirements analysis and format it properly
    const isJobAnalysis = (
        originalText?.includes('Job Requirements Analysis:') || 
        modifiedText?.includes('Job Requirements Analysis:') ||
        (modifiedText?.startsWith('{') && modifiedText?.includes('"technicalSkills"'))
    );
    
    // Format job analysis JSON if needed
    let leftText = originalText;
    let rightText = modifiedText;
    
    if (isJobAnalysis) {
        // Try to parse and format any JSON content
        if (rightText?.startsWith('{')) {
            try {
                const analysisObj = JSON.parse(rightText);
                rightText = 'Job Requirements Analysis:\n\n' + Object.entries(analysisObj)
                    .map(([category, items]) => {
                        // Convert category from camelCase to Title Case
                        const formattedCategory = category
                            .replace(/([A-Z])/g, ' $1')
                            .trim();
                        
                        // Ensure items is always an array
                        const itemArray = Array.isArray(items) ? items : 
                                        (items ? [items] : []);
                        
                        // Only show categories that have items
                        if (itemArray.length > 0) {
                            return `${formattedCategory}:\n${itemArray.map(item => `• ${item}`).join('\n')}`;
                        }
                        return `${formattedCategory}: None specified`;
                    })
                    .join('\n\n');
            } catch (e) {
                console.error('Failed to parse job analysis JSON:', e);
                // If parsing fails, show the raw text with a note
                rightText = 'Job Requirements Analysis:\n\nError parsing requirements. Raw data:\n' + rightText;
            }
        }

        // If the job analysis is in modifiedText, swap to ensure it's on the right
        if (leftText?.includes('Job Requirements Analysis:') || leftText?.startsWith('{')) {
            [leftText, rightText] = [rightText, leftText];
        }
    }
    
    // Create a simple HTML for side-by-side comparison
    let html = `
        <div class="simple-diff-container ${isJobAnalysis ? 'job-analysis' : ''}">
            <div class="simple-diff-header">
                <div class="simple-diff-header-left">${isJobAnalysis ? 'Resume' : 'Original Resume'}</div>
                <div class="simple-diff-header-right">${isJobAnalysis ? 'Job Requirements Analysis' : 'Modified Resume'}</div>
            </div>
            <div class="simple-diff-content">
                <div class="simple-diff-left">
                    <pre class="simple-diff-text">${escapeHtml(leftText)}</pre>
                </div>
                <div class="simple-diff-right">
                    <pre class="simple-diff-text">${escapeHtml(rightText)}</pre>
                </div>
            </div>
        </div>
    `;
    
    return html;
}

// Helper function to escape HTML special characters
function escapeHtml(text) {
    return (text || '')
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Highlight function that can work with both LaTeX commands and extracted text
export function highlightLatexSyntax(container) {
    // Only highlight LaTeX syntax in code areas
    const isLatexContent = container.innerHTML.includes('\\') && 
                          (container.innerHTML.includes('\\begin') || 
                           container.innerHTML.includes('\\section') ||
                           container.innerHTML.includes('\\textbf'));
    
    if (!isLatexContent) return;
    
    const codeElements = container.querySelectorAll('.d2h-code-line-ctn, .simple-diff-text');
    codeElements.forEach(line => {
        const content = line.innerHTML;
        // Skip if already formatted or doesn't contain LaTeX
        if (content.includes('<span class="tex-') || !content.includes('\\')) return;
        
        line.innerHTML = content.replace(
            /(\\[a-zA-Z]+)(\{[^}]*\})?/g,
            '<span class="tex-command">$1</span><span class="tex-arg">$2</span>'
        );
    });
}

// Add after other helper functions

// Helper function to highlight changes between two texts
function highlightChanges(originalText, modifiedText) {
    if (!originalText || !modifiedText) return modifiedText || originalText;
    
    // Split into words while preserving whitespace and punctuation
    const regex = /([^\s\w]|\s+|\w+)/g;
    const originalWords = originalText.match(regex) || [];
    const modifiedWords = modifiedText.match(regex) || [];
    
    let i = 0, j = 0;
    let result = '';
    
    while (i < originalWords.length && j < modifiedWords.length) {
        if (originalWords[i] === modifiedWords[j]) {
            result += originalWords[i];
            i++;
            j++;
        } else {
            // Look ahead to find next match
            let matchFound = false;
            let lookAhead = 0;
            const maxLookAhead = 3;
            
            // Try to find the next matching word
            while (lookAhead < maxLookAhead && j + lookAhead < modifiedWords.length) {
                if (originalWords[i] === modifiedWords[j + lookAhead]) {
                    // Addition found
                    for (let k = 0; k < lookAhead; k++) {
                        result += `<span class="text-addition">${modifiedWords[j + k]}</span>`;
                    }
                    result += originalWords[i];
                    j += lookAhead + 1;
                    i++;
                    matchFound = true;
                    break;
                } else if (originalWords[i + lookAhead] === modifiedWords[j]) {
                    // Removal found
                    for (let k = 0; k < lookAhead; k++) {
                        result += `<span class="text-removal">${originalWords[i + k]}</span>`;
                    }
                    result += modifiedWords[j];
                    i += lookAhead + 1;
                    j++;
                    matchFound = true;
                    break;
                }
                lookAhead++;
            }
            
            if (!matchFound) {
                // Mark as changed if no clear addition/removal pattern found
                result += `<span class="text-change">${modifiedWords[j]}</span>`;
                i++;
                j++;
            }
        }
    }
    
    // Add remaining words
    while (i < originalWords.length) {
        result += `<span class="text-removal">${originalWords[i]}</span>`;
        i++;
    }
    while (j < modifiedWords.length) {
        result += `<span class="text-addition">${modifiedWords[j]}</span>`;
        j++;
    }
    
    return result;
}