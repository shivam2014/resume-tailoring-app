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
        
        // Validate requirements structure
        if (!jobRequirements || typeof jobRequirements !== 'object') {
            throw new Error('Job requirements must be an object');
        }

        if (!jobRequirements.messages || !Array.isArray(jobRequirements.messages)) {
            throw new Error('Job requirements must contain a messages array');
        }

        // Validate each message has required fields per Mistral API
        const validRoles = ['system', 'user', 'assistant'];
        const invalidMessages = jobRequirements.messages.filter(msg =>
            !msg || typeof msg !== 'object' ||
            !msg.role || !validRoles.includes(msg.role) ||
            !msg.content || typeof msg.content !== 'string'
        );

        if (invalidMessages.length > 0) {
            throw new Error(
                'Invalid message format. Each message must have:\n' +
                `- role (one of: ${validRoles.join(', ')})\n` +
                '- content (string)'
            );
        }
        
        // First convert the resume content to plain text for analysis
        const plainTextResume = this.latexToPlainText(resumeContent);
        
        // System message defines the AI's role and behavior
        const systemMessage = {
            role: "system",
            content: "You are an expert resume tailoring assistant. Your task is to modify the LaTeX resume to match job requirements while preserving structure and formatting."
        };

        // Formatting instructions as user message
        const formatMessage = {
            role: "user",
            content: this.tailorPrompt
        };

        // Job requirements as user input
        const requirementsMessage = {
            role: "user",
            content: `Here are the job requirements: ${jobRequirements.messages[0].content}`
        };

        // Resume content as user input
        const resumeMessage = {
            role: "user",
            content: `Here is the LaTeX resume to tailor: ${resumeContent}`
        };

        const messages = [
            systemMessage,
            formatMessage,
            requirementsMessage,
            resumeMessage
        ];

        return this.retryApiCall(async () => {
            try {
                const response = await this.client.post('/chat/completions', {
                    model: "mistral-small-latest",
                    messages,
                    temperature: 0.1  // Lower temperature for more focused responses
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
                        
                        const data = trimmedLine.slice(5).trim();
                        
                        // Better handling of [DONE] marker
                        if (data === '[DONE]') {
                            // End of stream marker, skip processing
                            continue;
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
                            // Skip warnings for [DONE] markers
                            if (!data.includes('[DONE]')) {
                                console.warn('Warning: Invalid chunk received:', e.message);
                            }
                            continue;
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

                        // Clean up and extract proper JSON
                        // First, find the starting and ending positions of the JSON object
                        let jsonStr = jsonBuffer.trim();
                        const startPos = jsonStr.indexOf('{');
                        
                        if (startPos === -1) {
                            console.error('No JSON object found in response');
                            onError('Invalid response format: No JSON object found');
                            return;
                        }
                        
                        // Find the matching closing brace by tracking opening and closing braces
                        let openBraces = 0;
                        let endPos = -1;
                        
                        for (let i = startPos; i < jsonStr.length; i++) {
                            if (jsonStr[i] === '{') {
                                openBraces++;
                            } else if (jsonStr[i] === '}') {
                                openBraces--;
                                if (openBraces === 0) {
                                    endPos = i + 1; // Position after the closing brace
                                    break;
                                }
                            }
                        }
                        
                        if (endPos === -1) {
                            // If no proper closing brace found
                            console.log('No proper JSON closure found, attempting to fix');
                            jsonStr = jsonStr.substring(startPos) + '}';
                        } else {
                            // Extract just the proper JSON object
                            jsonStr = jsonStr.substring(startPos, endPos);
                            
                            // Log if there's extra content after the JSON (likely cause of the error)
                            if (endPos < jsonBuffer.length) {
                                console.log(`Found ${jsonBuffer.length - endPos} extra characters after JSON closure`);
                                console.log(`Extra content: ${jsonBuffer.substring(endPos, endPos + 20)}...`);
                            }
                        }
                        
                        // Replace common problematic characters
                        let cleanedJson = jsonStr
                            .replace(/[\u201C\u201D]/g, '"') // Replace smart quotes
                            .replace(/\\n/g, ' ')           // Replace newlines with spaces
                            .replace(/\s+/g, ' ')           // Normalize whitespace
                            .replace(/\[DONE\]/g, '')       // Remove any completion markers
                            .replace(/\\\\/g, '\\')         // Fix escaped backslashes
                            .trim();

                        try {
                            // Log the first and last 50 chars for debugging
                            if (process.env.NODE_ENV !== 'test') {
                                const jsonLength = cleanedJson.length;
                                console.log(`Attempting to parse JSON (length: ${jsonLength})`);
                                if (jsonLength > 100) {
                                    console.log(`Start: ${cleanedJson.substring(0, 50)}...`);
                                    console.log(`End: ...${cleanedJson.substring(jsonLength - 50)}`);
                                }
                            }
                            
                            // Validate JSON structure before parsing
                            if (!cleanedJson.startsWith('{') || !cleanedJson.endsWith('}')) {
                                console.warn('JSON structure appears invalid, attempting to fix');
                                if (!cleanedJson.startsWith('{')) cleanedJson = '{' + cleanedJson;
                                if (!cleanedJson.endsWith('}')) cleanedJson = cleanedJson + '}';
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
                            // When parsing fails, use more aggressive recovery techniques
                            console.error(`JSON parsing failed: ${error.message}`);
                            
                            try {
                                // Try to extract just a valid JSON object using regex
                                const jsonMatch = cleanedJson.match(/\{(?:[^{}]|(?:\{[^{}]*\}))*\}/);
                                if (jsonMatch) {
                                    const extractedJson = jsonMatch[0];
                                    console.log('Attempting to parse extracted JSON pattern');
                                    const parsedJson = JSON.parse(extractedJson);
                                    console.log('Recovered JSON using pattern extraction');
                                    onComplete(parsedJson);
                                    return;
                                }
                                
                                // If no match found, try another approach - create a valid JSON structure
                                console.log('Attempting to reconstruct JSON');
                                
                                // Extract key-value patterns that look like JSON properties
                                const propertyMatches = cleanedJson.match(/"[^"]+"\s*:\s*(?:\[[^\]]*\]|"[^"]*"|[0-9]+|true|false|null)/g);
                                
                                if (propertyMatches && propertyMatches.length > 0) {
                                    // Rebuild the JSON object from matched properties
                                    const reconstructedJson = '{\n' + propertyMatches.join(',\n') + '\n}';
                                    console.log('Reconstructed JSON from properties');
                                    const parsedJson = JSON.parse(reconstructedJson);
                                    onComplete(parsedJson);
                                    return;
                                }
                                
                                throw new Error('Could not extract or reconstruct valid JSON');
                            } catch (fallbackError) {
                                console.error('All JSON recovery attempts failed:', fallbackError.message);
                                onError(`Error parsing job requirements: ${error.message}. Please check the format of your input.`);
                            }
                        }
                    } catch (error) {
                        console.error('Error in stream end processing:', error.message);
                        onError(`Error processing job requirements: ${error.message}`);
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
        
        // System message defines the AI's role and behavior
        const systemMessage = {
            role: "system",
            content: "You are an expert resume tailoring assistant. Your task is to modify the LaTeX resume to match job requirements while preserving structure and formatting."
        };

        // Formatting instructions as user message
        const formatMessage = {
            role: "user",
            content: this.tailorPrompt
        };

        // Job requirements as user input
        const requirementsMessage = {
            role: "user",
            content: `Here are the job requirements: ${jobRequirements.messages[0].content}`
        };

        // Resume content as user input
        const resumeMessage = {
            role: "user",
            content: `Here is the LaTeX resume to tailor: ${resumeContent}`
        };

        // Create an abort controller for this request
        const controller = new AbortController();
        let retryCount = 0;
        const maxRetries = this.retryCount;
        
        const attemptRequest = async () => {
            try {
                const response = await this.client.post('/chat/completions', {
                    model: "mistral-small-latest",
                    messages: [
                        systemMessage,
                        formatMessage,
                        requirementsMessage,
                        resumeMessage
                    ],
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
        if (!chunk || typeof chunk === 'string') return false;
        
        // Handle various forms of the [DONE] marker
        const normalized = chunk.trim();
        return normalized === '[DONE]' || 
               normalized === 'data: [DONE]' || 
               normalized.includes('[DONE]') ||
               normalized.endsWith('[DONE]');
    }
}

/**
 * Extracts and sanitizes valid JSON from potentially malformed text
 * @param {string} text - The text that may contain JSON
 * @returns {object|null} - Parsed JSON object or null if extraction failed
 */
function extractValidJSON(text) {
    // Early return for [DONE] token
    if (text === '[DONE]' || text.trim() === '[DONE]') {
        console.log('Received [DONE] token, ignoring for JSON parsing');
        return null;
    }
    
    try {
        // First attempt: direct parsing
        return JSON.parse(text);
    } catch (e) {
        console.warn('Initial JSON parsing failed, attempting recovery:', e.message);
        
        try {
            // Clean the text and remove any potential [DONE] tokens
            let cleanedText = text
                .replace(/\[DONE\]/g, '')
                .replace(/^[^{]*/, '') // Remove anything before the first {
                .replace(/}[^}]*$/, '}') // Remove anything after the last }
                .trim();
            
            // Find balanced braces to extract the JSON object
            let openBraces = 0;
            let startIndex = -1;
            let endIndex = -1;
            
            for (let i = 0; i < cleanedText.length; i++) {
                if (cleanedText[i] === '{') {
                    if (openBraces === 0) startIndex = i;
                    openBraces++;
                } else if (cleanedText[i] === '}') {
                    openBraces--;
                    if (openBraces === 0) {
                        endIndex = i + 1;
                        break;
                    }
                }
            }
            
            // Extract the balanced JSON object
            if (startIndex !== -1 && endIndex !== -1) {
                const potentialJson = cleanedText.substring(startIndex, endIndex);
                return JSON.parse(potentialJson);
            }
            
            console.warn('Could not extract valid JSON using pattern matching. Content:',
                cleanedText.length > 100 ?
                    `${cleanedText.substring(0, 50)}...${cleanedText.substring(cleanedText.length - 50)}` :
                    cleanedText
            );
            return null;
        } catch (innerError) {
            console.error('JSON recovery failed:', innerError.message);
            return null;
        }
    }
}

/**
 * Process the raw response from Mistral API
 * @param {string} responseData - Raw response data
 * @returns {object|string|null} - Processed response or null if invalid
 */
function processMistralResponse(responseData) {
    // Check if the response is the [DONE] token
    if (responseData === '[DONE]' || responseData.trim() === '[DONE]') {
        return { done: true };
    }
    
    // Try to parse the response as JSON
    const parsedData = extractValidJSON(responseData);
    if (parsedData) {
        return parsedData;
    }
    
    // If we can't parse it as JSON, return the raw data
    return responseData;
}

async function processStreamingResponse(response, onChunk, onComplete, onError) {
    try {
      let fullContent = '';
      let buffer = '';
  
      response.on('data', (chunk) => {
        const chunkStr = chunk.toString();
        buffer += chunkStr;
  
        // Process complete data events (separated by double newlines)
        const lines = buffer.split('\n');
        
        // Process all complete lines
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          
          // Skip empty lines
          if (!line) continue;
          
          // Handle end of stream marker
          if (line === 'data: [DONE]') {
            console.log('Received end of stream marker');
            continue;
          }
          
          // Process data lines
          if (line.startsWith('data: ')) {
            try {
              const jsonData = line.substring(6); // Remove 'data: ' prefix
              const parsedData = JSON.parse(jsonData);
              
              if (parsedData.choices && parsedData.choices[0]?.delta?.content) {
                const content = parsedData.choices[0].delta.content;
                fullContent += content;
                onChunk(content);
              }
            } catch (e) {
              console.warn(`Warning: Invalid chunk received: ${e.message}`, line);
            }
          }
        }
        
        // Keep the last line in the buffer as it might be incomplete
        buffer = lines[lines.length - 1];
      });
  
      response.on('end', () => {
        console.log('Processing final content...');
        try {
          // Extract content from final content if needed
          let finalContent = fullContent.trim();
          
          // Debug logging to see what we're trying to parse
          console.log('Content length:', finalContent.length);
          if (finalContent.length > 100) {
            console.log('Content start:', finalContent.substring(0, 50));
            console.log('Content end:', finalContent.substring(finalContent.length - 50));
          }
          
          // Find JSON boundaries more precisely
          const firstBraceIndex = finalContent.indexOf('{');
          let lastBraceIndex = -1;
          
          if (firstBraceIndex !== -1) {
            // Find the matching closing brace for the opening brace
            let openBraces = 0;
            for (let i = firstBraceIndex; i < finalContent.length; i++) {
              if (finalContent[i] === '{') openBraces++;
              else if (finalContent[i] === '}') {
                openBraces--;
                if (openBraces === 0) {
                  // This is the matching closing brace
                  lastBraceIndex = i;
                  break;
                }
              }
            }
          }
          
          // Extract only what appears to be valid JSON
          if (firstBraceIndex !== -1 && lastBraceIndex !== -1) {
            finalContent = finalContent.substring(firstBraceIndex, lastBraceIndex + 1);
            console.log('Extracted JSON content with precise boundary detection');
          } else {
            console.log('Could not find precise JSON boundaries, using best-effort approach');
            
            // Fallback approach - try to find the last closing brace
            if (finalContent.includes('{') && !finalContent.trim().endsWith('}')) {
              console.log('Adding missing closing brace');
              finalContent += '}';
            }
            
            // Remove any trailing content after the JSON
            const potentialEndIndex = finalContent.lastIndexOf('}') + 1;
            if (potentialEndIndex > 0) {
              finalContent = finalContent.substring(0, potentialEndIndex);
              console.log('Truncated content to last closing brace');
            }
          }

          // Additional JSON cleaning
          finalContent = finalContent
            .replace(/[\u201C\u201D]/g, '"') // Replace smart quotes
            .replace(/\\n/g, ' ')           // Replace newlines with spaces
            .replace(/[\r\n]/g, ' ')        // Remove actual newlines
            .replace(/\s+/g, ' ')           // Normalize whitespace
            .trim();
          
          console.log('Applied JSON structure fixes');

          try {
            // Parse the cleaned JSON
            const parsedContent = JSON.parse(finalContent);
            console.log('Successfully parsed JSON with keys:', Object.keys(parsedContent).join(', '));
            
            // Validate the parsed content has the expected structure
            if (!parsedContent || typeof parsedContent !== 'object') {
              throw new Error('Parsed content is not a valid object');
            }
            
            onComplete(parsedContent);
          } catch (jsonError) {
            console.error('Failed to parse job requirements:', jsonError);
            console.error('Content causing parse error:', finalContent);
            onError(`Error parsing job requirements: ${jsonError.message}. Please check the format of your input.`);
          }
        } catch (error) {
          console.error('Error processing final content:', error);
          onError(`Error processing response: ${error.message}`);
        }
      });
  
      response.on('error', (error) => {
        console.error('Error in API response stream:', error);
        onError(`API response stream error: ${error.message}`);
      });
    } catch (error) {
      console.error('Error processing streaming response:', error);
      onError(`Error processing streaming response: ${error.message}`);
    }
  }
  
  // ...existing code...
  
  // Update the streamAnalyzeJob function to use the improved processing
  async function streamAnalyzeJob(sessionData) {
    const { sessionId, jobDescription, apiKey, analyzePrompt } = sessionData;
    
    try {
      // ...existing code...
  
      // Make sure to use the updated processStreamingResponse function
      await processStreamingResponse(
        response,
        (chunk) => {
          // Send chunk to clients
          sessionData.clients.forEach(client => {
            client.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
          });
        },
        (parsedJobRequirements) => {
          // Handle successful completion
          sessionData.jobRequirements = parsedJobRequirements;
          sessionData.isAnalyzing = false;
          
          sessionData.clients.forEach(client => {
            client.write(`data: ${JSON.stringify({ 
              type: 'complete', 
              requirements: parsedJobRequirements 
            })}\n\n`);
          });
        },
        (error) => {
          // Handle error
          sessionData.error = error;
          sessionData.isAnalyzing = false;
          
          console.error(`Error in analysis session ${sessionId}:`, error);
          
          sessionData.clients.forEach(client => {
            client.write(`data: ${JSON.stringify({ type: 'error', message: error })}\n\n`);
          });
        }
      );
    } catch (error) {
      // ...existing error handling...
    }
  }
  
  // ...existing code...

export default MistralHelper;