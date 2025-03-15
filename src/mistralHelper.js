import axios from 'axios';

export class MistralHelper {
    validateApiKey(apiKey) {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
            throw new Error('Invalid API key. Please provide a valid Mistral API key.');
        }
        return true;
    }
    
    constructor(apiKey, options = {}) {
        try {
            this.validateApiKey(apiKey);
            this.apiKey = apiKey;
            this.retryCount = options.retryCount || 2;
            this.retryDelay = options.retryDelay || 1000;
            
            this.client = axios.create({
                baseURL: 'https://api.mistral.ai/v1',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                timeout: options.timeout || 30000 // Add timeout option
            });
            
            // Quiet the logging in test environments
            if (process.env.NODE_ENV !== 'test') {
                console.log('Request Headers:', {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey.substring(0, 5)}...` // Only log part of the API key for security
                });
            }
            
            this.client.interceptors.response.use(response => response, error => {
                if (error.response && error.response.status === 401) {
                    console.error('Authentication failed. Please check your Mistral API key.');
                    error.isAuthError = true; // Mark auth errors for special handling
                } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                    console.error('Request timeout. The Mistral API is taking too long to respond.');
                } else if (error.response) {
                    console.error(`API error: ${error.response.status} - ${error.response.data?.error?.message || 'Unknown error'}`);
                } else if (error.request) {
                    console.error('No response received from Mistral API. Please check your network connection.');
                } else {
                    console.error('Error setting up request:', error.message);
                }
                return Promise.reject(error);
            });
            
            // Store custom prompts or use defaults
            this.analyzePrompt = options.analyzePrompt || this.getDefaultAnalyzePrompt();
            this.tailorPrompt = options.tailorPrompt || this.getDefaultTailorPrompt();
            
            // Initialize array to track active streams for cleanup
            this.activeStreams = [];

            // Add a helper method for error message creation
            this.createErrorMessage = (error, context) => {
                // Check for specific error types
                if (error.name === 'AbortError' || error.message === 'canceled') {
                    return 'Request was manually aborted by user or system';
                }
                
                if (error.code === 'ECONNRESET') {
                    return 'Connection was reset. This may be due to network instability';
                }
                
                if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                    return `Request timed out. The API service may be overloaded (context: ${context})`;
                }
                
                if (error.message === 'Stream interrupted') {
                    return 'Stream was interrupted, possibly due to network issues';
                }
                
                if (error.message.includes('Invalid stream response') || 
                    error.message.includes('Invalid chunk')) {
                    return 'Received invalid data from API, check response format';
                }
                
                // Authentication errors
                if (error.response && error.response.status === 401) {
                    return 'Authentication failed. Please check your Mistral API key and try again';
                }
                
                // Rate limiting errors
                if (error.response && error.response.status === 429) {
                    return 'API rate limit exceeded. Please try again later';
                }
                
                // Server errors
                if (error.response && error.response.status >= 500) {
                    return `Server error (${error.response.status}). The API service may be experiencing issues`;
                }
                
                // Fallback to general error
                return `Unexpected API error: ${error.message || 'Unknown error'}`;
            };
        } catch (error) {
            console.error('MistralHelper initialization error:', error.message);
            throw error; // Re-throw to allow caller to handle
        }
    }

    getDefaultAnalyzePrompt() {
        return `You are a professional resume analyst. Analyze this job description and extract key requirements, qualifications, and preferences:

[JOB_DESCRIPTION]

Format the response as a detailed JSON object with these categories:
- technicalSkills: array of specific technical skills, tools, and technologies required or preferred
- softSkills: array of interpersonal skills, communication abilities, and work style traits mentioned
- experience: array of experience requirements including years, specific domain knowledge, and industry experience
- education: array of educational requirements including degrees, fields of study, and certifications
- keyResponsibilities: array of main job duties and responsibilities
- preferredQualifications: array of "nice-to-have" qualifications that aren't strictly required
- industryKnowledge: array of required industry-specific knowledge or domain expertise
- toolsAndPlatforms: array of specific software, tools, or platforms mentioned

Be specific and maintain the exact terminology used in the job description.`;
    }

    getDefaultTailorPrompt() {
        return `You are a LaTeX resume optimization expert. Given a LaTeX resume and job requirements, improve the resume by:

1. STRICTLY maintain the existing LaTeX structure, commands, and environments
2. DO NOT add any new experiences, skills, or qualifications not present in the original resume
3. Reorganize and emphasize existing content to match job requirements:
   - Move most relevant experiences and skills to the top of their sections
   - Rewrite bullet points to use similar terminology as the job description
   - Use \\textbf{} to highlight key matching skills and achievements
   - Adjust technical terms to match the job's terminology
4. Keep exact LaTeX formatting:
   - Preserve all \\begin{} and \\end{} environment tags
   - Maintain document structure and section order
   - Keep all original LaTeX commands intact
5. Focus on emphasizing relevant experience:
   - Prioritize bullet points that match job responsibilities
   - Highlight transferable skills when exact matches aren't available
   - Maintain chronological order within sections
6. Maintain professional formatting:
   - Keep consistent spacing and indentation
   - Preserve all LaTeX comments
   - Don't modify the document preamble

Resume Content:
[RESUME_CONTENT]

Job Requirements:
[JOB_REQUIREMENTS]

Return only the modified LaTeX content. Keep all original LaTeX commands and structure intact.`;
    }

    // Add retry mechanism for API calls
    async retryApiCall(apiCallFn, maxRetries = this.retryCount) {
        let lastError = null;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    // Only log retries in non-test environments
                    if (process.env.NODE_ENV !== 'test') {
                        console.log(`Retry attempt ${attempt}/${maxRetries} for API call`);
                    }
                    // Wait before retry with exponential backoff
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay * Math.pow(2, attempt - 1)));
                }
                
                return await apiCallFn();
            } catch (error) {
                lastError = error;
                // Don't retry on authentication errors
                if (error.isAuthError || (error.response && error.response.status === 401)) {
                    console.error('Authentication error, not retrying');
                    throw error;
                }
                
                // Only retry on network errors or 5xx errors
                if (!error.response || (error.response.status >= 500 && error.response.status < 600)) {
                    // Only log warnings in non-test environments or on final failure
                    if (process.env.NODE_ENV !== 'test' || attempt === maxRetries) {
                        console.warn(`API call failed, ${attempt < maxRetries ? 'will retry' : 'no more retries'}: ${error.message}`, {
                            attempt,
                            maxRetries,
                            errorType: error.code || (error.response ? error.response.status : 'unknown')
                        });
                    }
                    continue;
                }
                
                // Don't retry for other errors
                throw error;
            }
        }
        
        // If we get here, all retries failed
        throw lastError;
    }

    // Add new helper method to convert LaTeX to readable text
    latexToPlainText(latex) {
        if (!latex) return '';
        
        // Remove document class and package declarations
        let text = latex
            .replace(/%.*/g, '') // Remove comments
            .replace(/\\documentclass.*?\\begin\{document\}/s, '')
            .replace(/\\end\{document\}/, '');

        // Extract and format name from complex centerline command
        const namePattern = /\\centerline\{[^}]*\\fontfamily\{[^}]*\}[^}]*\\textbf\{[^}]*\\fontsize\{\d+\.\d+\}\{\d+\}\\selectfont\\textls\[\d+\]\{([A-Z])\}[^}]*\\fontsize\{\d+\.\d+\}\{\d+\}\\selectfont\\textls\[\d+\]\{([A-Za-z]+)\}[^}]*\\fontsize\{\d+\.\d+\}\{\d+\}\\selectfont\\textls\[\d+\]\{([A-Z])\}[^}]*\\fontsize\{\d+\.\d+\}\{\d+\}\\selectfont\\textls\[\d+\]\{([A-Za-z]+)\}[^}]*\}\}/;
        const nameMatch = text.match(namePattern);
        if (nameMatch) {
            text = text.replace(namePattern, `${nameMatch[1]}${nameMatch[2]} ${nameMatch[3]}${nameMatch[4]}\n\n`);
        }

        // Handle contact information line
        text = text.replace(/\\centerline\{([^}]+)\}/g, (match, content) => {
            return content
                .replace(/\\href\{mailto:([^}]+)\}\{([^}]+)\}/g, '$2')
                .replace(/\\href\{([^}]+)\}\{([^}]+)\}/g, '$2')
                .replace(/\s*\|\s*/g, ' | ')
                .trim() + '\n\n';
        });

        // Handle section headers with proper formatting
        text = text.replace(/\\section\*\{(?:[^{}]*\\fontsize\{[^{}]*\}[^{}]*\\textls\[\d+\]\{([A-Z])\}[^{}]*\\textls\[\d+\]\{([A-Za-z\s]+)\}|([^{}]*))\}/g, 
            (match, firstLetter, restOfTitle, simpleName) => {
                if (firstLetter && restOfTitle) {
                    return `\n\n${firstLetter}${restOfTitle}\n`;
                } else if (simpleName) {
                    return `\n\n${simpleName}\n`;
                }
                return match;
            });

        // Handle itemize environments with proper indentation
        text = text.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (match, content) => {
            return '\n' + content
                .split('\\item')
                .filter(item => item.trim())
                .map(item => '• ' + item.trim())
                .join('\n') + '\n';
        });

        // Handle text formatting while preserving content
        text = text
            .replace(/\\textbf\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$1')
            .replace(/\\textit\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$1')
            .replace(/\\textls\[\d+\]\{([^{}]+)\}/g, '$1')
            .replace(/\\fontsize\{\d+(?:\.\d+)?\}\{\d+(?:\.\d+)?\}\\selectfont/g, '')
            .replace(/\\fontfamily\{[^{}]*\}\\selectfont/g, '')
            .replace(/\\emph\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$1')
            .replace(/\\hfill/g, ' - ')
            .replace(/\\vspace\{[^{}]*\}/g, '\n')
            .replace(/\\\\/g, '\n')
            // Special handling of LaTeX escapes
            .replace(/\\([\%\$\&\_\#\{\}])/g, '$1')  // First handle special character escapes
            .replace(/\\\\/g, '\n')                   // Then handle double backslash
            .replace(/\\,/g, ' ')                     // Handle \, command
            // Handle LaTeX commands with braces
            .replace(/\\text(?:bf|it|rm)\{([^{}]*)\}/g, '$1')
            .replace(/\\emph\{([^{}]*)\}/g, '$1')
            .replace(/\\[a-zA-Z]+\{([^{}]*)\}/g, '$1')
            // Cleanup
            .replace(/\\[a-zA-Z]+/g, '')    // Remove remaining LaTeX commands
            .replace(/\\/g, '')             // Remove any remaining single backslashes
            .replace(/\{|\}/g, '')          // Remove braces
            .replace(/\s*--\s*/g, ' - ')    // Standardize dashes
            .replace(/[ \t]+/g, ' ')        // Normalize whitespace
            .trim();

        // Final cleanup and formatting
        text = text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line)
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/([^•])\n([•])/g, '$1\n\n$2') // Add blank line before bullet lists
            .trim();

        // Ensure proper spacing after sections
        text = text
            .replace(/^(#\s+[^\n]+)$/gm, '$1\n')  // Add newline after section headers
            .replace(/([.!?])\n(?!#|•)/g, '$1\n\n');  // Add blank line after paragraphs

        // Special handling for job requirements if the text is JSON
        if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
            try {
                const requirements = JSON.parse(text);
                let formattedText = 'Job Requirements Analysis:\n\n';
                
                for (const [category, items] of Object.entries(requirements)) {
                    if (Array.isArray(items) && items.length > 0) {
                        // Convert category from camelCase to Title Case
                        const formattedCategory = category
                            .replace(/([A-Z])/g, ' $1')
                            .replace(/^./, str => str.toUpperCase());
                        
                        formattedText += `${formattedCategory}:\n`;
                        items.forEach(item => {
                            formattedText += `• ${item}\n`;
                        });
                        formattedText += '\n';
                    }
                }
                return formattedText.trim();
            } catch (e) {
                // If JSON parsing fails, return the original text
                return text;
            }
        }

        return text;
    }

    async analyzeJobDescription(description) {
        // Allow empty string but trim it first
        const trimmedDescription = description?.trim() || '';
        if (typeof description !== 'string') {
            throw new Error('Invalid job description. Please provide a string value.');
        }
        
        // Replace placeholder in prompt
        const prompt = this.analyzePrompt.replace('[JOB_DESCRIPTION]', trimmedDescription);

        return this.retryApiCall(async () => {
            try {
                const response = await this.client.post('/chat/completions', {
                    model: "mistral-small",
                    messages: [{
                        role: "user",
                        content: prompt + "\nMake sure to return valid JSON only."
                    }]
                });

                const content = response.data.choices[0]?.message?.content;
                
                if (!content) {
                    throw new Error('Empty response from API');
                }
                
                // Enhanced JSON extraction and cleanup
                let jsonStr = content;
                try {
                    // Try parsing as-is first
                    return JSON.parse(content);
                } catch {
                    // Try finding and extracting JSON if direct parse fails
                    const jsonMatch = content.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        throw new Error('No valid JSON found in response');
                    }

                    jsonStr = jsonMatch[0]
                        .replace(/[\u201C\u201D]/g, '"') // Replace smart quotes
                        .replace(/\s+(?=(?:[^"]*"[^"]*")*[^"]*$)/g, ' ') // Clean whitespace
                        .replace(/,\s*[}\]]/g, '$1'); // Remove trailing commas

                    return JSON.parse(jsonStr);
                }
            } catch (error) {
                if (error.response?.status === 401) {
                    const authError = new Error('Authentication failed. Please check your Mistral API key and update it in the .env file.');
                    authError.isAuthError = true;
                    throw authError;
                }
                throw new Error(error.response?.data?.error?.message || error.message);
            }
        });
    }

    async tailorResume(resumeContent, jobRequirements) {
        if (!resumeContent || typeof resumeContent !== 'string') {
            throw new Error('Invalid resume content. Please provide valid LaTeX content.');
        }
        
        if (!jobRequirements || typeof jobRequirements !== 'object') {
            throw new Error('Invalid job requirements. Please provide valid job requirements object.');
        }
        
        // First convert the resume content to plain text for analysis
        const plainTextResume = this.latexToPlainText(resumeContent);
        
        // Replace placeholders in prompt with properly formatted content
        const prompt = this.tailorPrompt
            .replace('[RESUME_CONTENT]', resumeContent)
            .replace('[JOB_REQUIREMENTS]', JSON.stringify(jobRequirements, null, 2));

        return this.retryApiCall(async () => {
            try {
                const response = await this.client.post('/chat/completions', {
                    model: "mistral-small",
                    messages: [{
                        role: "user",
                        content: prompt
                    }]
                });

                const content = response.data.choices[0]?.message?.content;
                if (!content) {
                    throw new Error('Empty response from API');
                }
                
                return content;
            } catch (error) {
                console.error('Error tailoring resume:', error.response?.data || error.message);
                throw new Error(error.response?.data?.error?.message || error.message);
            }
        });
    }

    // Add new methods for streaming API responses
    
    /**
     * Stream job description analysis from Mistral API
     * @param {string} description - The job description to analyze
     * @param {function} onChunk - Callback function to handle each chunk of streamed data
     * @param {function} onComplete - Callback function called when streaming is complete
     * @param {function} onError - Callback function to handle errors
     * @returns {Object} - Controller object with an abort method
     */
    async streamAnalyzeJobDescription(description, onChunk, onComplete, onError) {
        if (!description || typeof description !== 'string' || description.trim() === '') {
            onError('Invalid job description. Please provide a non-empty job description.');
            return { abort: () => {} };
        }
        
        if (typeof onChunk !== 'function' || typeof onComplete !== 'function' || typeof onError !== 'function') {
            console.error('Invalid callback functions provided');
            return { abort: () => {} };
        }
        
        // Create a system message to enforce JSON format
        if (process.env.NODE_ENV !== 'test') {
            console.log('API Key:', `${this.apiKey.substring(0, 5)}...`); // Only log part of the API key for security
        }
        
        const systemMessage = {
            role: "system",
            content: "You MUST respond with a complete, well-formed JSON object ONLY. No other text allowed. Begin your response with '{' and end with '}'."
        };

        // Use the job analysis prompt as the user message
        const userMessage = {
            role: "user",
            content: this.analyzePrompt.replace('[JOB_DESCRIPTION]', description)
        };

        // Create an abort controller for this request
        const controller = new AbortController();
        let retryCount = 0;
        const maxRetries = this.retryCount;
        
        const attemptRequest = async () => {
            try {
                const response = await this.client.post('/chat/completions', {
                    model: "mistral-small-latest",
                    messages: [systemMessage, userMessage],
                    stream: true,
                    temperature: 0.1
                }, {
                    responseType: 'stream',
                    signal: controller.signal,
                    timeout: 60000 // Extended timeout for streaming
                });

                const stream = this.validateStream(response.data);
                const decoder = new TextDecoder('utf-8');
                let buffer = '';
                let jsonBuffer = '';
                let fullResponse = '';
                let foundStart = false;
                
                // Store reference to the response data stream for cleanup
                this.activeStreams.push({ stream, controller });

                const processBuffer = () => {
                    const lines = buffer.split('\n\n');
                    buffer = lines.pop() || ''; // Keep last partial chunk

                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;
                        
                        const data = trimmedLine.slice(5);
                        
                        // Move this check outside of try/catch
                        if (data === '[DONE]') {
                            continue; // Skip processing [DONE]
                        }
                        
                        try {
                            const json = JSON.parse(data);
                            const content = json.choices?.[0]?.delta?.content || '';
                            
                            if (content) {
                                // Handle JSON content
                                if (!foundStart && content.includes('{')) {
                                    foundStart = true;
                                    const startIndex = content.indexOf('{');
                                    jsonBuffer = content.slice(startIndex);
                                } else if (foundStart) {
                                    jsonBuffer += content;
                                }

                                fullResponse += content;
                                
                                // Only send content after we've found a valid JSON start
                                if (foundStart) {
                                    onChunk(content);
                                }
                            }
                        } catch (e) {
                            console.warn('Warning: Invalid chunk received:', e.message);
                            // For [DONE] markers, just continue without error
                            if (data === '[DONE]') {
                                continue;
                            }
                            // Only call onError for actual JSON parsing errors
                            if (!this._isFinalChunk(data)) {
                                console.warn('Invalid chunk format:', e.message);
                            }
                        }
                    }
                };

                stream.on('data', (chunk) => {
                    try {
                        buffer += decoder.decode(chunk);
                        processBuffer();
                    } catch (err) {
                        console.warn('Error processing stream chunk:', err.message);
                        // Don't fail the whole stream for a single bad chunk
                    }
                });

                stream.on('end', () => {
                    // Remove this stream from active streams array on completion
                    this.activeStreams = this.activeStreams.filter(s => s.stream !== stream);
                    
                    try {
                        if (process.env.NODE_ENV !== 'test') {
                          console.log('\nProcessing final content...');
                        }

                        // If the buffer is empty or invalid, log it
                        if (!jsonBuffer.trim()) {
                            const emptyBufferError = new Error('Empty JSON buffer received');
                            console.error('Error:', emptyBufferError.message);
                            onError('No valid JSON content received from the API. The response was empty.');
                            return;
                        }

                        // Clean up and parse the JSON
                        let jsonStr = jsonBuffer.trim();
                        let cleanedJson = jsonStr;

                        // Only log if we need to fix the JSON structure
                        if (!jsonStr.startsWith('{')) {
                            console.log('Adding missing opening brace');
                            cleanedJson = '{' + cleanedJson;
                        }
                        if (!jsonStr.endsWith('}')) {
                            console.log('Adding missing closing brace');
                            cleanedJson = cleanedJson + '}';
                        }

                        // Clean up the JSON buffer
                        cleanedJson = cleanedJson
                            .replace(/[\u201C\u201D]/g, '"') // Replace smart quotes
                            .replace(/\\n/g, ' ') // Replace newlines with spaces
                            .replace(/\s+/g, ' ') // Normalize whitespace
                            .trim();

                        // Only log if we actually had to make fixes
                        if (cleanedJson !== jsonStr) {
                            console.log('Applied JSON structure fixes');
                        }

                        // Attempt to parse the cleaned JSON
                        const parsedJson = JSON.parse(cleanedJson);
                        
                        // Log parsing success and content summary
                        const categories = Object.keys(parsedJson);
                        if (categories.length > 0) {
                            console.log('Successfully parsed JSON with categories:', categories.join(', '));
                        } else {
                            console.warn('Warning: Parsed JSON is empty');
                        }

                        // Ensure all array values are strings
                        let hasArrays = false;
                        for (const key in parsedJson) {
                            if (Array.isArray(parsedJson[key])) {
                                hasArrays = true;
                                parsedJson[key] = parsedJson[key].map(item => 
                                    typeof item === 'string' ? item : JSON.stringify(item)
                                );
                            }
                        }
                        
                        if (hasArrays) {
                            console.log('Normalized array values to strings');
                        }

                        onComplete(parsedJson);
                    } catch (error) {
                        console.error('Failed to parse job requirements:', error.message, { stack: error.stack });
                        onError(`Error parsing job requirements: ${error.message}. Please check the format of your input.`);
                    }
                });

                stream.on('error', (err) => {
                    // Remove this stream from active streams array on error
                    this.activeStreams = this.activeStreams.filter(s => s.stream !== stream);
                    
                    // Log detailed error info but send user-friendly message
                    console.error('Stream error:', err.message, { 
                        stack: err.stack,
                        code: err.code,
                        type: err.constructor.name
                    });
                    
                    const errorMessage = this.createErrorMessage(err, 'job analysis');
                    onError(errorMessage);
                });

                // Return controller for external abort capability
                return { abort: () => controller.abort() };

            } catch (error) {
                // Handle setup/connection errors with detailed logging
                console.error('API error:', error.message, { 
                    stack: error.stack,
                    code: error.code,
                    status: error.response?.status,
                    statusText: error.response?.statusText
                });
                
                // Retry logic for certain errors
                if (retryCount < maxRetries && 
                    (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED' || 
                     (error.response && error.response.status >= 500))) {
                    
                    retryCount++;
                    console.log(`Retrying stream request (${retryCount}/${maxRetries})...`);
                    
                    // Exponential backoff
                    const delay = this.retryDelay * Math.pow(2, retryCount - 1);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    
                    return attemptRequest();
                }
                
                // Create user-friendly error message based on error type
                const errorMessage = this.createErrorMessage(error, 'job analysis');
                onError(errorMessage);
                
                return { abort: () => {} }; // Return no-op function if request failed
            }
        };
        
        return attemptRequest();
    }

    /**
     * Stream resume tailoring from Mistral API
     * @param {string} resumeContent - The original LaTeX resume content
     * @param {object} jobRequirements - The parsed job requirements
     * @param {function} onChunk - Callback function to handle each chunk of streamed data
     * @param {function} onComplete - Callback function called when streaming is complete
     * @param {function} onError - Callback function to handle errors
     * @returns {Object} - Controller object with an abort method
     */
    async streamTailorResume(resumeContent, jobRequirements, onChunk, onComplete, onError) {
        // Input validation
        if (!resumeContent || typeof resumeContent !== 'string') {
            onError('Invalid resume content. Please provide valid LaTeX content.');
            return { abort: () => {} };
        }
        
        if (!jobRequirements || typeof jobRequirements !== 'object') {
            onError('Invalid job requirements. Please provide valid job requirements object.');
            return { abort: () => {} };
        }
        
        if (typeof onChunk !== 'function' || typeof onComplete !== 'function' || typeof onError !== 'function') {
            console.error('Invalid callback functions provided');
            return { abort: () => {} };
        }
        
        // First convert the resume content to plain text for analysis
        const plainTextResume = this.latexToPlainText(resumeContent);
        
        // Replace placeholders in prompt with properly formatted content
        const prompt = this.tailorPrompt
            .replace('[RESUME_CONTENT]', resumeContent)
            .replace('[JOB_REQUIREMENTS]', JSON.stringify(jobRequirements, null, 2));

        // Create an abort controller for this request
        const controller = new AbortController();
        let retryCount = 0;
        const maxRetries = this.retryCount;
        
        const attemptRequest = async () => {
            try {
                const response = await this.client.post('/chat/completions', {
                    model: "mistral-small-latest",
                    messages: [{
                        role: "user",
                        content: prompt
                    }],
                    stream: true,
                    temperature: 0.1 // Add temperature for more stable responses
                }, {
                    responseType: 'stream',
                    signal: controller.signal,
                    timeout: 30000 // Add explicit timeout
                });

                const stream = this.validateStream(response.data);
                const decoder = new TextDecoder('utf-8');
                let buffer = ''; // Define buffer here
                let accumulatedResponse = '';

                this.activeStreams.push({ stream, controller });

                const processBuffer = () => {
                    const lines = buffer.split('\n\n');
                    buffer = lines.pop() || ''; // Keep last partial chunk

                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;
                        
                        const data = trimmedLine.slice(5);
                        
                        // Move this check outside of try/catch
                        if (data === '[DONE]') {
                            continue; // Skip processing [DONE]
                        }
                        
                        try {
                            const json = JSON.parse(data);
                            const content = json.choices?.[0]?.delta?.content || '';
                            
                            if (content) {
                                accumulatedResponse += content;
                                onChunk(content);
                            }
                        } catch (e) {
                            console.warn('Warning: Invalid chunk received:', e.message);
                            // For [DONE] markers, just continue without error
                            if (data === '[DONE]') {
                                continue;
                            }
                            // Only call onError for actual JSON parsing errors
                            if (!this._isFinalChunk(data)) {
                                console.warn('Invalid chunk format:', e.message);
                            }
                        }
                    }
                };

                stream.on('data', (chunk) => {
                    try {
                        buffer += decoder.decode(chunk);
                        processBuffer();
                    } catch (err) {
                        console.warn('Stream processing error:', err.message, { stack: err.stack });
                        // Log but don't fail the stream for a single chunk error
                    }
                });

                stream.on('end', () => {
                    this.activeStreams = this.activeStreams.filter(s => s.stream !== stream);
                    
                    // Process any remaining data
                    if (buffer.trim()) {
                        try {
                            processBuffer();
                        } catch (err) {
                            console.warn('Error processing final buffer:', err.message);
                        }
                    }

                    if (!accumulatedResponse.trim()) {
                        onError('No valid content received from the API. The response may be empty or malformed.');
                        return;
                    }
                    onComplete(accumulatedResponse);
                });

                stream.on('error', (err) => {
                    // Remove this stream from active streams array on error
                    this.activeStreams = this.activeStreams.filter(s => s.stream !== stream);
                    
                    // Log detailed error info but send user-friendly message
                    console.error('Stream error:', err.message, { 
                        stack: err.stack,
                        code: err.code,
                        type: err.constructor.name
                    });
                    
                    const errorMessage = this.createErrorMessage(err, 'resume tailoring');
                    onError(errorMessage);
                });

                // Cleanup on errors
                stream.on('close', () => {
                    // Remove this stream from active streams array when closed
                    this.activeStreams = this.activeStreams.filter(s => s.stream !== stream);
                    
                    // Only report error if we didn't get any content and this wasn't a normal close after completion
                    if (!accumulatedResponse.trim()) {
                        onError('Stream closed without receiving valid content. The connection may have been interrupted.');
                    }
                });
                
                // Return controller for external abort capability
                return { abort: () => controller.abort() };

            } catch (error) {
                // Handle setup/connection errors with detailed logging
                console.error('Error setting up streaming:', error.message, { 
                    stack: error.stack,
                    code: error.code,
                    status: error.response?.status,
                    statusText: error.response?.statusText
                });
                
                // Retry logic for certain errors
                if (retryCount < maxRetries && 
                    (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED' || 
                     (error.response && error.response.status >= 500))) {
                    
                    retryCount++;
                    console.log(`Retrying stream request (${retryCount}/${maxRetries})...`);
                    
                    // Exponential backoff
                    const delay = this.retryDelay * Math.pow(2, retryCount - 1);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    
                    return attemptRequest();
                }
                
                // Create user-friendly error message based on error type
                const errorMessage = this.createErrorMessage(error, 'resume tailoring');
                onError(errorMessage);
                
                return { abort: () => {} }; // Return no-op function if request failed
            }
        };
        
        return attemptRequest();
    }
    
    /**
     * Clean up all active streams and pending requests
     */
    cleanup() {
        const streamCount = this.activeStreams.length;
        if (streamCount > 0 && process.env.NODE_ENV !== 'test') {
            console.log(`Cleaning up ${streamCount} active streams`);
        }
        
        // Abort all active requests
        this.activeStreams.forEach(({ controller, stream }) => {
            try {
                controller.abort();
                // Remove all listeners to prevent memory leaks
                if (stream && typeof stream.removeAllListeners === 'function') {
                    stream.removeAllListeners('data');
                    stream.removeAllListeners('end');
                    stream.removeAllListeners('error');
                    stream.removeAllListeners('close');
                }
            } catch (err) {
                console.warn('Error while cleaning up stream:', err.message);
            }
        });
        
        // Clear active streams array
        this.activeStreams = [];
        
        return streamCount; // Return count for testing purposes
    }

    // Add new helper method for stream validation
    validateStream(stream) {
        if (!stream || typeof stream.on !== 'function') {
            throw new Error('Invalid stream response from API');
        }
        return stream;
    }

    // Add helper method for chunk processing
    processStreamChunk(chunk, decoder) {
        try {
            const lines = decoder.decode(chunk).split('\n\n');
            return lines
                .map(line => {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data: ')) return null;
                    
                    const data = trimmedLine.slice(5);
                    // Explicitly handle [DONE] as a special case
                    if (data === '[DONE]') return { done: true };
                    
                    try {
                        const json = JSON.parse(data);
                        const content = json.choices?.[0]?.delta?.content || '';
                        return content ? { content } : null;
                    } catch (e) {
                        return null;
                    }
                })
                .filter(Boolean);
        } catch (err) {
            console.warn('Error processing stream chunk:', err.message);
            return [];
        }
    }

    // Add helper method to detect if this is the final chunk
    _isFinalChunk(chunk) {
        return chunk && typeof chunk === 'string' && chunk.includes('[DONE]');
    }
}

export default MistralHelper;