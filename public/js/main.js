import { initCollapsibles, observeDOMChanges } from './util.js';
import streamingHandler, { processJobAnalysis } from './streamingHandler.js';

// Try importing diffUtils, with improved error handling
let createDiffHtml, highlightLatexSyntax;
async function loadDiffUtils() {
    try {
        const diffUtils = await import('./diffUtils.js');
        createDiffHtml = diffUtils.createDiffHtml;
        highlightLatexSyntax = diffUtils.highlightLatexSyntax;
        console.log('Successfully loaded diffUtils');
        return true;
    } catch (err) {
        console.error('Error importing diffUtils:', err);
        // Fallback implementation using global objects
        if (window.Diff && window.Diff2Html) {
            console.log('Using fallback diff implementation with global objects');
            createDiffHtml = async function(originalText, modifiedText, viewType) {
                const diffPatch = window.Diff.createTwoFilesPatch(
                    'Original Resume', 'Modified Resume',
                    originalText || '', modifiedText || ''
                );
                
                return window.Diff2Html.html(
                    window.Diff2Html.parse(diffPatch), {
                    drawFileList: false,
                    matching: 'lines',
                    outputFormat: viewType
                });
            };
            
            highlightLatexSyntax = function(container) {
                const codeLines = container.querySelectorAll('.d2h-code-line-ctn');
                codeLines.forEach(line => {
                    const content = line.textContent;
                    line.innerHTML = content.replace(
                        /(\\[a-zA-Z]+)(\{[^}]*\})?/g,
                        '<span class="tex-command">$1</span><span class="tex-arg">$2</span>'
                    );
                });
            };
            return true;
        }
        
        // Ultimate fallback - just show plain text
        createDiffHtml = async function(originalText, modifiedText) {
            return `
                <div class="fallback-diff">
                    <h4>Original Content:</h4>
                    <pre>${originalText}</pre>
                    <h4>Modified Content:</h4>
                    <pre>${modifiedText}</pre>
                </div>
            `;
        };
        highlightLatexSyntax = function() {}; // No-op
        return false;
    }
}

// Initialize after DOM and module are loaded
async function init() {
    // Load diff utils first
    await loadDiffUtils();
    
    // Global variables and constants
    let originalContent = '';
    let currentDiffView = 'side-by-side';
    let useTextMode = true; // Default to text mode instead of LaTeX comparison
    let isLatexContent = false; // Flag to track if we're working with LaTeX

    const DEFAULT_ANALYZE_PROMPT = `Analyze this job description and extract key requirements, skills, and qualifications:

[JOB_DESCRIPTION]

Format the response as a JSON object with these categories:
- technicalSkills: array of technical skills required
- softSkills: array of soft skills mentioned
- experience: array of experience requirements
- education: array of educational requirements
- keyResponsibilities: array of main job responsibilities`;

    const DEFAULT_TAILOR_PROMPT = `You are a resume optimization expert. Given a LaTeX resume content and job requirements, improve the resume by:

1. DO NOT add any new experiences or skills that are not present in the original resume
2. Only reorganize and highlight existing content to better match job requirements
3. Use LaTeX \\textbf{} command to highlight relevant existing skills and experiences that match the requirements
4. Reorder bullet points within each section to prioritize most relevant experiences
5. Keep all original content but optimize their presentation
6. Maintain exact LaTeX formatting and structure

Resume Content:
[RESUME_CONTENT]

Job Requirements:
[JOB_REQUIREMENTS]

Return only the modified LaTeX content. Do not add any new experiences or skills that weren't in the original resume.`;

    // Utility function to add log entries
    function addLog(message, type = 'info') {
        const logArea = document.getElementById('logArea');
        if (!logArea) return;
        
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        entry.textContent = message;
        logArea.appendChild(entry);
        logArea.scrollTop = logArea.scrollHeight;
    }

    async function showResumeChanges(originalContent, modifiedContent) {
        try {
            // Check if content is LaTeX
            isLatexContent = originalContent?.includes('\\documentclass') || 
                originalContent?.includes('\\begin{document}') ||
                modifiedContent?.includes('\\documentclass') ||
                modifiedContent?.includes('\\begin{document}');
                
            // Get diff HTML using our utility, passing the useTextMode flag
            const diffHtml = await createDiffHtml(originalContent, modifiedContent, currentDiffView, useTextMode);

            // Display the changes
            const changesDiv = document.querySelector('#resumeChanges .changes-content');
            changesDiv.innerHTML = diffHtml;
            document.getElementById('resumeChanges').style.display = 'block';

            // Add syntax highlighting only for raw LaTeX view, not the extracted text
            if (!useTextMode && isLatexContent) {
                highlightLatexSyntax(changesDiv);
            }
            
            // Add the toggle button for LaTeX content if it doesn't already exist
            const previewHeader = document.querySelector('.preview-header');
            if (previewHeader && !document.getElementById('textModeBtn') && isLatexContent) {
                const toggleButton = document.createElement('button');
                toggleButton.id = 'textModeBtn';
                toggleButton.className = 'secondary-button';
                toggleButton.textContent = useTextMode ? 'Show Raw LaTeX' : 'Show Readable Text';
                toggleButton.style.marginLeft = '10px';
                toggleButton.addEventListener('click', toggleComparisonMode);
                previewHeader.appendChild(toggleButton);
            } else if (document.getElementById('textModeBtn') && isLatexContent) {
                // Update button text if it already exists
                document.getElementById('textModeBtn').textContent = useTextMode ? 'Show Raw LaTeX' : 'Show Readable Text';
            }
        } catch (error) {
            addLog(`Error creating diff: ${error.message}`, 'error');
            console.error('Diff creation error:', error);
            // Show a simple fallback comparison if diff fails
            const changesDiv = document.querySelector('#resumeChanges .changes-content');
            changesDiv.innerHTML = `
                <div class="fallback-diff">
                    <h4>Unable to create visual diff. Here's the modified content:</h4>
                    <pre>${modifiedContent}</pre>
                </div>
            `;
            document.getElementById('resumeChanges').style.display = 'block';
        }
    }

    function setDiffView(type) {
        currentDiffView = type;
        const tabs = document.querySelectorAll('.preview-tab');
        tabs.forEach(tab => {
            if (tab.dataset.view === type) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
        
        // Re-render diff with new view type
        const modifiedContent = localStorage.getItem('modifiedContent');
        if (originalContent && modifiedContent) {
            showResumeChanges(originalContent, modifiedContent);
        }
    }

    // Toggle between text mode and LaTeX comparison mode
    function toggleComparisonMode() {
        useTextMode = !useTextMode;
        
        // Update toggle button text
        const toggleBtn = document.getElementById('textModeBtn');
        if (toggleBtn) {
            toggleBtn.textContent = useTextMode ? 'Show Raw LaTeX' : 'Show Readable Text';
            toggleBtn.setAttribute('title', useTextMode ? 
                'Switch to viewing raw LaTeX code' : 
                'Switch to viewing human-readable text extracted from LaTeX');
        }
        
        // Re-render with the new mode
        const modifiedContent = localStorage.getItem('modifiedContent');
        if (originalContent && modifiedContent) {
            showResumeChanges(originalContent, modifiedContent);
        }

        // Show a more informative message in the log
        addLog(`Switched to ${useTextMode ? 'human-readable text' : 'raw LaTeX code'} view`, 'info');
    }

    function savePrompts(e) {
        e?.preventDefault();
        const analyzePrompt = document.getElementById('analyzePrompt').value;
        const tailorPrompt = document.getElementById('tailorPrompt').value;
        localStorage.setItem('analyzePrompt', analyzePrompt);
        localStorage.setItem('tailorPrompt', tailorPrompt);
        addLog('Custom prompts saved', 'info');
    }

    function resetPrompts(e) {
        e?.preventDefault();
        document.getElementById('analyzePrompt').value = DEFAULT_ANALYZE_PROMPT;
        document.getElementById('tailorPrompt').value = DEFAULT_TAILOR_PROMPT;
        localStorage.setItem('analyzePrompt', DEFAULT_ANALYZE_PROMPT);
        localStorage.setItem('tailorPrompt', DEFAULT_TAILOR_PROMPT);
        addLog('Prompts reset to default', 'info');
    }

    function editChanges(e) {
        e?.preventDefault();
        let modifiedContent;
        
        // Use the raw LaTeX content for editing if available
        if (window.rawModifiedContent && isLatexContent) {
            modifiedContent = window.rawModifiedContent;
            console.log("Using raw LaTeX content for editing");
        } else {
            modifiedContent = localStorage.getItem('modifiedContent');
            console.log("Using stored content for editing");
        }
        
        if (!modifiedContent) {
            addLog('No modified content found', 'error');
            return;
        }

        const changesDiv = document.querySelector('#resumeChanges .changes-content');
        changesDiv.innerHTML = `
            <div class="editor-container">
                <div class="editor-notice">
                    <p>You are editing the ${isLatexContent ? 'raw LaTeX' : ''} code that will be used to generate your PDF.</p>
                </div>
                <textarea class="resume-editor">${modifiedContent}</textarea>
                <div class="editor-actions">
                    <button type="button" id="saveEditsBtn" class="primary-button">Save Changes</button>
                    <button type="button" id="cancelEditsBtn" class="secondary-button">Cancel</button>
                </div>
            </div>
        `;

        // Add event listeners for the new buttons
        document.getElementById('saveEditsBtn').addEventListener('click', saveChanges);
        document.getElementById('cancelEditsBtn').addEventListener('click', cancelEdit);
    }

    function saveChanges(e) {
        e?.preventDefault();
        const editor = document.querySelector('.resume-editor');
        const modifiedContent = editor.value;
        
        // Update both the localStorage and raw modified content
        localStorage.setItem('modifiedContent', modifiedContent);
        if (isLatexContent) {
            window.rawModifiedContent = modifiedContent;
        }
        
        showResumeChanges(originalContent, modifiedContent);
        addLog('Changes saved successfully', 'info');
    }

    function cancelEdit(e) {
        e?.preventDefault();
        const modifiedContent = localStorage.getItem('modifiedContent');
        showResumeChanges(originalContent, modifiedContent);
    }

    async function acceptChanges(e) {
        e?.preventDefault();
        const modifiedContent = localStorage.getItem('modifiedContent');
        if (!modifiedContent) {
            addLog('No modified content found', 'error');
            return;
        }

        try {
            // Show processing state
            const actionsDiv = document.querySelector('#resumeChanges .editor-actions');
            actionsDiv.innerHTML = '<div class="processing">Generating PDF...</div>';
            addLog('Generating PDF...', 'info');

            const response = await fetch('/generate-pdf', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content: modifiedContent })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate PDF');
            }

            // Add download links
            const downloadSection = document.createElement('div');
            downloadSection.className = 'download-section';
            downloadSection.innerHTML = `
                <a href="/uploads/${data.pdfPath}" target="_blank" class="download-link">View PDF</a>
                <a href="/uploads/${data.pdfPath}" download class="download-link">Download PDF</a>
            `;

            // Restore action buttons and add download section
            actionsDiv.innerHTML = `
                <button type="button" id="editChangesBtn" class="primary-button">Edit Changes</button>
                <button type="button" id="acceptChangesBtn" class="secondary-button">Generate New PDF</button>
            `;
            actionsDiv.appendChild(downloadSection);

            // Re-attach event listeners
            document.getElementById('editChangesBtn').addEventListener('click', editChanges);
            document.getElementById('acceptChangesBtn').addEventListener('click', acceptChanges);

            addLog('PDF generated successfully!', 'info');
        } catch (error) {
            // Show error details
            const actionsDiv = document.querySelector('#resumeChanges .editor-actions');
            actionsDiv.innerHTML = `
                <div class="error-section">
                    <h4>PDF Generation Error</h4>
                    <p class="error-message">${error.message}</p>
                    ${error.latexLog ? `
                        <div class="latex-log">
                            <h5>LaTeX Compilation Log:</h5>
                            <pre>${error.latexLog}</pre>
                        </div>
                    ` : ''}
                    <div class="error-actions">
                        <button type="button" id="editChangesBtn" class="primary-button">Edit LaTeX Code</button>
                        <button type="button" id="retryPdfBtn" class="secondary-button">Try Again</button>
                    </div>
                </div>
            `;

            // Re-attach event listeners
            document.getElementById('editChangesBtn').addEventListener('click', editChanges);
            document.getElementById('retryPdfBtn').addEventListener('click', acceptChanges);

            addLog(`Error generating PDF: ${error.message}`, 'error');
        }
    }

    // Create a container to show streaming content
    function createStreamingContainer() {
        const streamingContainer = document.createElement('div');
        streamingContainer.className = 'streaming-container';
        streamingContainer.innerHTML = `
            <div class="streaming-header">
                <h3>Live AI Processing</h3>
                <div class="streaming-status">Initializing...</div>
            </div>
            <div class="streaming-content"></div>
        `;
        return streamingContainer;
    }

    // Update streaming container with new content
    function updateStreamingContent(container, content, append = true) {
        const contentDiv = container.querySelector('.streaming-content');
        if (append) {
            contentDiv.innerHTML += content;
        } else {
            contentDiv.innerHTML = content;
        }
        contentDiv.scrollTop = contentDiv.scrollHeight;
    }

    // Update streaming status
    function updateStreamingStatus(container, status) {
        const statusDiv = container.querySelector('.streaming-status');
        statusDiv.textContent = status;
    }

    // Handle streaming job analysis
    async function streamAnalyzeJob(formData) {
        // Create streaming container and add to the page
        const streamingContainer = createStreamingContainer();
        document.getElementById('result').style.display = 'block';
        document.getElementById('result').innerHTML = '';
        document.getElementById('result').appendChild(streamingContainer);
        
        updateStreamingStatus(streamingContainer, 'Analyzing job description...');
        addLog('Starting job analysis with real-time streaming...', 'info');
        
        let analysisResult = '';
        let jobRequirements = null;
        
        try {
            // Get and sanitize job description
            let jobDescription = formData.get('jobDescription');
            
            // More thorough sanitization of input
            // Remove non-printable characters and control characters
            jobDescription = jobDescription.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ');
            
            // Remove invalid JSON characters that could cause parsing issues
            jobDescription = jobDescription.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, ' ');
            
            // Escape quotes and backslashes that might break JSON
            jobDescription = jobDescription.replace(/\\(?!["\\/bfnrt])/g, '\\\\');
            jobDescription = jobDescription.replace(/"/g, '\\"');
            
            // Convert FormData to URL-encoded format
            const urlEncodedData = new URLSearchParams();
            urlEncodedData.append('jobDescription', jobDescription);
            urlEncodedData.append('apiKey', formData.get('apiKey'));
            urlEncodedData.append('analyzePrompt', formData.get('analyzePrompt'));
            urlEncodedData.append('tailorPrompt', formData.get('tailorPrompt'));
            
            // Use streamingHandler with URL-encoded data
            await streamingHandler.streamAnalyzeJob(urlEncodedData, {
                onChunk: (chunk) => {
                    analysisResult += chunk;
                    updateStreamingContent(streamingContainer, chunk);
                },
                onComplete: (fullResponse) => {
                    jobRequirements = fullResponse;
                    console.log('Raw job requirements response:', fullResponse); // Debug raw response
                    
                    try {
                        // Enhanced JSON parsing with better error recovery
                        if (typeof fullResponse === 'string') {
                            // Clean the response string before parsing
                            const cleanedResponse = fullResponse
                                .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ') // Replace control chars with spaces
                                .replace(/\n/g, '\\n')
                                .replace(/\r/g, '\\r')
                                .replace(/\t/g, '\\t')
                                .replace(/\\/g, '\\\\')
                                .replace(/"/g, '\\"')
                                .trim();
                            
                            // Try to fix common JSON issues
                            let jsonToTry = cleanedResponse;
                            
                            // Try to parse with different approaches
                            try {
                                // First try direct parsing
                                jobRequirements = JSON.parse(cleanedResponse);
                            } catch (parseError1) {
                                console.warn('Initial JSON parsing failed:', parseError1);
                                
                                try {
                                    // Second attempt: try to extract valid JSON using regex
                                    const jsonMatch = cleanedResponse.match(/(\{.*\})/);
                                    if (jsonMatch && jsonMatch[0]) {
                                        jobRequirements = JSON.parse(jsonMatch[0]);
                                    } else {
                                        throw new Error('Could not extract valid JSON');
                                    }
                                } catch (parseError2) {
                                    console.warn('JSON extraction failed:', parseError2);
                                    
                                    // Last resort: create a simple object with the text
                                    jobRequirements = {
                                        raw: cleanedResponse,
                                        parseError: 'Could not parse response as JSON'
                                    };
                                    
                                    addLog('Warning: Could not parse job requirements as JSON', 'warning');
                                }
                            }
                        }
                    } catch (parseError) {
                        console.error('Failed to parse requirements:', parseError);
                        // Create fallback object with the raw text
                        jobRequirements = {
                            raw: fullResponse,
                            parseError: parseError.message
                        };
                    }
                    
                    updateStreamingStatus(streamingContainer, 'Analysis complete!');
                    addLog('Job analysis complete!', 'info');
                    
                    // Show the requirements card
                    const requirementsCard = document.getElementById('requirementsCard');
                    requirementsCard.style.display = 'block';
                    
                    let requirementsHtml = '<div class="requirements-content">';
                    
                    if (jobRequirements && typeof jobRequirements === 'object' && Object.keys(jobRequirements).length > 0) {
                        console.log('Processing requirements:', jobRequirements); // Debug processed requirements
                        
                        // Check if we have a parse error first
                        if (jobRequirements.parseError) {
                            requirementsHtml += `
                                <div class="parse-error-notice">
                                    <h4>⚠️ JSON Parsing Issue</h4>
                                    <p>The job analysis contains data that couldn't be properly structured. 
                                    You can still continue with resume tailoring, but the requirements may not be displayed correctly.</p>
                                </div>`;
                        }
                        
                        // Process each category
                        Object.entries(jobRequirements).forEach(([category, items]) => {
                            // Skip the error fields
                            if (category === 'parseError' || category === 'raw') return;
                            
                            const formattedCategory = category.replace(/([A-Z])/g, ' $1').trim();
                            requirementsHtml += `<h4>${formattedCategory}</h4>`;
                            requirementsHtml += '<ul class="requirements-list">';
                            
                            const itemsArray = Array.isArray(items) ? items : 
                                             (items ? [items] : []);
                            
                            if (itemsArray.length > 0 && itemsArray.some(item => item && item.trim())) {
                                itemsArray.forEach(item => {
                                    if (item && item.trim()) {
                                        requirementsHtml += `<li>${item}</li>`;
                                    }
                                });
                            } else {
                                requirementsHtml += '<li class="no-requirements">None specified</li>';
                            }
                            
                            requirementsHtml += '</ul>';
                        });
                    } else {
                        // Better fallback for empty requirements
                        requirementsHtml += `
                            <div class="no-requirements-container">
                                <p class="no-requirements">No requirements analysis available. The AI analysis may have failed to extract structured requirements.</p>
                                <p class="requirements-suggestion">You can try:</p>
                                <ul class="requirements-help">
                                    <li>Checking if the job description was provided</li>
                                    <li>Making sure the job description contains clear requirements</li>
                                    <li>Trying again with a more detailed job description</li>
                                </ul>
                            </div>`;
                    }
                    
                    requirementsHtml += '</div>';
                    
                    const requirementsList = document.getElementById('requirementsList');
                    if (requirementsList) {
                        // Clear any existing content first
                        requirementsList.innerHTML = '';
                        requirementsList.innerHTML = requirementsHtml;
                    } else {
                        console.error('Requirements list element not found!');
                    }
                    
                    // Continue with resume tailoring even with partial requirements
                    if (jobRequirements && Object.keys(jobRequirements).length > 0) {
                        streamTailorResume(originalContent, jobRequirements, formData.get('apiKey'), formData.get('tailorPrompt'));
                    } else {
                        addLog('No requirements extracted. Please try again with a more detailed job description.', 'error');
                    }
                },
                onStatus: (status, message) => {
                    updateStreamingStatus(streamingContainer, message || status);
                    addLog(`Status: ${message || status}`, 'info');
                },
                onError: (error) => {
                    console.error('Analysis error:', error); // Debug log
                    updateStreamingStatus(streamingContainer, 'Error: ' + error);
                    addLog(`Error: ${error}`, 'error');
                    document.getElementById('result').innerHTML += `
                        <div class="error-message">
                            <h3>Error During Analysis</h3>
                            <p>${error}</p>
                            <div class="error-recovery">
                                <p>This may be due to a JSON parsing issue. You can try:</p>
                                <ul>
                                    <li>Simplifying the job description</li>
                                    <li>Removing special characters</li>
                                    <li>Breaking down the analysis into smaller parts</li>
                                </ul>
                            </div>
                        </div>`;
                }
            });
        } catch (error) {
            console.error('Error in streamAnalyzeJob:', error); // Debug log
            addLog(`Error: ${error.message}`, 'error');
            document.getElementById('result').innerHTML += `
                <div class="error-message">
                    <h3>Error During Analysis</h3>
                    <p>${error.message}</p>
                </div>`;
        }
    }
    
    // Stream resume tailoring
    async function streamTailorResume(resumeContent, jobRequirements, apiKey, tailorPrompt) {
        // Create streaming container for resume tailoring
        const streamingContainer = createStreamingContainer();
        document.getElementById('result').appendChild(streamingContainer);
        
        updateStreamingStatus(streamingContainer, 'Tailoring resume...');
        addLog('Starting resume tailoring with real-time streaming...', 'info');
        
        let tailoredContent = '';
        
        try {
            // Use our streaming handler to stream the resume tailoring
            await streamingHandler.streamTailorResume({
                resumeContent,
                jobRequirements,
                apiKey,
                tailorPrompt
            }, {
                onChunk: (chunk) => {
                    tailoredContent += chunk;
                    updateStreamingContent(streamingContainer, chunk);
                },
                onComplete: (fullResponse) => {
                    // Store modified content
                    localStorage.setItem('modifiedContent', fullResponse);
                    
                    // Set default view mode for LaTeX content to text mode (readable)
                    useTextMode = isLatexContent ? true : false;
                    
                    // Store raw modified content for LaTeX editing
                    if (isLatexContent && fullResponse) {
                        window.rawModifiedContent = fullResponse;
                    }
                    
                    updateStreamingStatus(streamingContainer, 'Resume tailoring complete!');
                    addLog('Resume tailoring complete!', 'info');
                    
                    // Show diff view
                    showResumeChanges(originalContent, fullResponse);
                    
                    // Clear result div after showing changes
                    document.getElementById('result').style.display = 'none';
                },
                onStatus: (status, message) => {
                    updateStreamingStatus(streamingContainer, message || status);
                    addLog(`Status: ${message || status}`, 'info');
                },
                onError: (error) => {
                    updateStreamingStatus(streamingContainer, 'Error: ' + error);
                    addLog(`Error: ${error}`, 'error');
                    
                    // Show error in result div
                    document.getElementById('result').innerHTML += `
                        <div class="error-section">
                            <h3>Error</h3>
                            <p style="color: var(--error);">${error}</p>
                        </div>
                    `;
                }
            });
        } catch (error) {
            updateStreamingStatus(streamingContainer, 'Error: ' + error.message);
            addLog(`Error: ${error.message}`, 'error');
            
            // Show error in result div
            document.getElementById('result').innerHTML += `
                <div class="error-section">
                    <h3>Error</h3>
                    <p style="color: var(--error);">${error.message}</p>
                </div>
            `;
        }
    }

    // Handle form submission
    async function handleSubmit(e) {
        e.preventDefault();
        
        // Clear previous errors
        document.querySelectorAll('.field-error').forEach(el => el.remove());
        
        // Reset validation styling on all form fields
        document.querySelectorAll('#resumeForm input, #resumeForm textarea, #resumeForm select').forEach(field => {
            field.classList.remove('error-field');
        });
        
        // Track if we have any validation errors
        let hasErrors = false;
        
        const formData = new FormData();
        
        // Validate API key
        const apiKey = document.getElementById('apiKey').value.trim();
        if (!apiKey) {
            // Add visual indicator next to the field
            const apiKeyField = document.getElementById('apiKey');
            apiKeyField.classList.add('error-field'); // Add error class to the field itself
            const errorSpan = document.createElement('span');
            errorSpan.className = 'field-error';
            errorSpan.textContent = 'API key is required';
            apiKeyField.parentNode.appendChild(errorSpan);
            
            addLog('Please enter your Mistral API key first', 'error');
            hasErrors = true;
        } else {
            formData.append('apiKey', apiKey);
        }

        // Validate resume file
        const resumeFile = document.getElementById('resumeFile').files[0];
        if (!resumeFile) {
            // Add visual indicator next to the field
            const resumeFileField = document.getElementById('resumeFile');
            resumeFileField.classList.add('error-field'); // Add error class to the field itself
            const errorSpan = document.createElement('span');
            errorSpan.className = 'field-error';
            errorSpan.textContent = 'Resume file is required';
            resumeFileField.parentNode.appendChild(errorSpan);
            
            addLog('Please upload a resume file', 'error');
            hasErrors = true;
        }
        
        // Validate job description
        const jobDescription = document.getElementById('jobDescription').value.trim();
        if (!jobDescription) {
            // Add visual indicator next to the field
            const jobDescField = document.getElementById('jobDescription');
            jobDescField.classList.add('error-field'); // Add error class to the field itself
            const errorSpan = document.createElement('span');
            errorSpan.className = 'field-error';
            errorSpan.textContent = 'Job description is required';
            jobDescField.parentNode.appendChild(errorSpan);
            
            addLog('Please enter a job description', 'error');
            hasErrors = true;
        } else {
            formData.append('jobDescription', jobDescription);
        }
        
        
        // Exit early if any validation errors
        if (hasErrors) {
            return;
        }

        // Add the remaining form values
        const analyzePrompt = document.getElementById('analyzePrompt').value;
        const tailorPrompt = document.getElementById('tailorPrompt').value;

        // Store original content
        originalContent = await resumeFile.text();
        
        // Check if it's a LaTeX file
        isLatexContent = originalContent.includes('\\documentclass') || originalContent.includes('\\begin{document}');
        
        // Store raw original content for LaTeX editing
        if (isLatexContent) {
            window.rawOriginalContent = originalContent;
        }
        
        formData.append('resumeFile', resumeFile);
        formData.append('analyzePrompt', analyzePrompt);
        formData.append('tailorPrompt', tailorPrompt);
        
        // Save API key for convenience
        localStorage.setItem('mistralApiKey', apiKey);
        
        // Show processing state
        document.getElementById('result').style.display = 'block';
        document.getElementById('result').innerHTML = '<h3>Processing...</h3><p>Please wait while we analyze your resume...</p>';
        
        addLog('Starting resume analysis...', 'info');
        
        // Always use streaming now
        streamAnalyzeJob(formData);
    }

    // Load saved API key
    const savedApiKey = localStorage.getItem('mistralApiKey');
    if (savedApiKey) {
        document.getElementById('apiKey').value = savedApiKey;
    }

    // Load saved prompts
    const savedAnalyzePrompt = localStorage.getItem('analyzePrompt') || DEFAULT_ANALYZE_PROMPT;
    const savedTailorPrompt = localStorage.getItem('tailorPrompt') || DEFAULT_TAILOR_PROMPT;
    
    document.getElementById('analyzePrompt').value = savedAnalyzePrompt;
    document.getElementById('tailorPrompt').value = savedTailorPrompt;

    // Setup form submission
    const form = document.getElementById('resumeForm');
    if (form) {
        form.addEventListener('submit', handleSubmit);
    }

    // Add a note about streaming to the API key area
    const apiKeyField = document.getElementById('apiKey');
    if (apiKeyField && !document.getElementById('streamingNote')) {
        const streamingNote = document.createElement('div');
        streamingNote.id = 'streamingNote';
        streamingNote.className = 'streaming-note';
        streamingNote.innerHTML = `
            <p><i>This application uses real-time streaming to provide immediate feedback as the AI processes your resume.</i></p>
        `;
        apiKeyField.parentNode.insertBefore(streamingNote, apiKeyField.nextSibling);
    }

    // Setup diff view tabs
    document.querySelectorAll('.preview-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            setDiffView(e.target.dataset.view);
        });
    });

    // Setup prompt buttons
    document.getElementById('savePromptsBtn')?.addEventListener('click', savePrompts);
    document.getElementById('resetPromptsBtn')?.addEventListener('click', resetPrompts);

    // Setup resume action buttons
    document.getElementById('editChangesBtn')?.addEventListener('click', editChanges);
    document.getElementById('acceptChangesBtn')?.addEventListener('click', acceptChanges);

    // Initialize collapsibles
    initCollapsibles();
    
    // Set up mutation observer to reinitialize collapsibles when DOM changes
    observeDOMChanges(initCollapsibles);

    // Initialize log area
    addLog('Ready to process resumes with real-time streaming', 'info');

    // Add global toggle function for accessibility from outside modules
    window.toggleTextMode = toggleComparisonMode;
}

// Wait for both DOM and module to load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Add a global reinitializer that's accessible outside module scope
window.reinitializeCollapsibles = function() {
    // Just import and call the function once
    import('./util.js').then(module => {
        if (typeof module.initCollapsibles === 'function') {
            module.initCollapsibles();
        }
    }).catch(err => {
        console.error('Failed to reinitialize collapsibles:', err);
    });
};

// Single initialization on page load - reduces redundant calls
window.addEventListener('load', function() {
    if (window.reinitializeCollapsibles) {
        window.reinitializeCollapsibles();
    }
});

// Options:
// 1. Remove this standalone function if not needed
// OR
// 2. Define the missing helper functions it references:
function showError(message) {
  const errorElement = document.getElementById('error-message');
  errorElement.textContent = message;
  errorElement.classList.remove('hidden');
  setTimeout(() => {
    errorElement.classList.add('hidden');
  }, 5000);
}

function resetUI() {
  // Clear any previous results or error messages
  const errorMessages = document.querySelectorAll('.error-message');
  errorMessages.forEach(el => el.remove());
  
  // Reset other UI elements as needed
}

// Define other missing helper functions: handleAnalysisChunk, handleAnalysisComplete, 
// handleAnalysisError, handleStatusUpdate, showLoader

// Removed duplicate handleSubmit function - using the one defined at line 884


function showLoader(show) {
  let loader = document.getElementById('loader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'loader';
    loader.className = 'loader';
    document.body.appendChild(loader);
  }
  
  loader.style.display = show ? 'block' : 'none';
}

function handleAnalysisChunk(chunk) {
  console.log('Received chunk:', chunk.substring(0, 50) + (chunk.length > 50 ? '...' : ''));
}

function handleAnalysisComplete(results) {
  console.log('Analysis complete:', results);
  showLoader(false);
}

function handleAnalysisError(error) {
  console.error('Analysis error:', error);
  showError(error);
  showLoader(false);
}

function handleStatusUpdate(status, message) {
  console.log(`Status: ${status} - ${message}`);
}

// Using the handleSubmit function defined at line 586

/**
 * Validates the form fields and shows validation errors
 * @returns {Boolean} True if form is valid, false otherwise
 */
const validateForm = () => {
  const apiKey = document.getElementById('apiKey').value;
  const jobDescription = document.getElementById('jobDescription').value;
  const resumeFile = document.getElementById('resumeFile').files[0];
  const jobType = document.getElementById('jobType').value;
  const targetPosition = document.getElementById('targetPosition').value;
  
  let isValid = true;
  
  // Clear previous validation errors
  clearValidationErrors();
  
  // Check required fields
  if (!apiKey) {
    showFieldError('apiKey', 'API Key is required');
    isValid = false;
  }
  
  if (!jobDescription) {
    showFieldError('jobDescription', 'Job description is required');
    isValid = false;
  }
  
  if (!resumeFile) {
    showFieldError('resumeFile', 'Resume file is required');
    isValid = false;
  }
  
  if (!jobType) {
    showFieldError('jobType', 'Job type is required');
    isValid = false;
  }
  
  if (!targetPosition) {
    showFieldError('targetPosition', 'Target position is required');
    isValid = false;
  }
  
  return isValid;
};

/**
 * Shows an error message for a specific form field
 * @param {String} fieldId - Field ID to show error for
 * @param {String} message - Error message to display
 */

/**
 * Clears all validation errors from the form
 */
const clearValidationErrors = () => {
  // Remove all error-field classes
  document.querySelectorAll('.error-field').forEach(field => {
    field.classList.remove('error-field');
  });
  
  // Remove all validation error messages
  document.querySelectorAll('.validation-error').forEach(error => {
    error.remove();
  });
};
