import axios from 'axios';

export class MistralHelper {
    constructor(apiKey, options = {}) {
        this.apiKey = apiKey;
        this.client = axios.create({
            baseURL: 'https://api.mistral.ai/v1',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            }
        });
        
        // Store custom prompts or use defaults
        this.analyzePrompt = options.analyzePrompt || this.getDefaultAnalyzePrompt();
        this.tailorPrompt = options.tailorPrompt || this.getDefaultTailorPrompt();
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
        // Replace placeholder in prompt
        const prompt = this.analyzePrompt.replace('[JOB_DESCRIPTION]', description);

        try {
            const response = await this.client.post('/chat/completions', {
                model: "mistral-small",
                messages: [{
                    role: "user",
                    content: prompt + "\nMake sure to return valid JSON only."
                }]
            });

            const content = response.data.choices[0].message.content;
            
            // Try to find and extract JSON content
            let jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No valid JSON found in response');
            }

            // Clean up common JSON formatting issues
            let jsonStr = jsonMatch[0]
                .replace(/[\u201C\u201D]/g, '"') // Replace smart quotes
                .replace(/\s+(?=(?:[^"]*"[^"]*")*[^"]*$)/g, ' ') // Clean up extra whitespace outside quotes
                .replace(/,\s*}/g, '}') // Remove trailing commas
                .replace(/,\s*]/g, ']'); // Remove trailing commas in arrays

            return JSON.parse(jsonStr);
        } catch (error) {
            console.error('Error analyzing job description:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || error.message);
        }
    }

    async tailorResume(resumeContent, jobRequirements) {
        // First convert the resume content to plain text for analysis
        const plainTextResume = this.latexToPlainText(resumeContent);
        
        // Replace placeholders in prompt with properly formatted content
        const prompt = this.tailorPrompt
            .replace('[RESUME_CONTENT]', resumeContent)
            .replace('[JOB_REQUIREMENTS]', JSON.stringify(jobRequirements, null, 2));

        try {
            const response = await this.client.post('/chat/completions', {
                model: "mistral-small",
                messages: [{
                    role: "user",
                    content: prompt
                }]
            });

            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('Error tailoring resume:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || error.message);
        }
    }

    // Add new methods for streaming API responses
    
    /**
     * Stream job description analysis from Mistral API
     * @param {string} description - The job description to analyze
     * @param {function} onChunk - Callback function to handle each chunk of streamed data
     * @param {function} onComplete - Callback function called when streaming is complete
     * @param {function} onError - Callback function to handle errors
     */
    async streamAnalyzeJobDescription(description, onChunk, onComplete, onError) {
        // Create a system message to enforce JSON format
        const systemMessage = {
            role: "system",
            content: "You MUST respond with a complete, well-formed JSON object ONLY. No other text allowed. Begin your response with '{' and end with '}'."
        };

        // Use the job analysis prompt as the user message
        const userMessage = {
            role: "user",
            content: this.analyzePrompt.replace('[JOB_DESCRIPTION]', description)
        };

        try {
            const response = await this.client.post('/chat/completions', {
                model: "mistral-small-latest",
                messages: [systemMessage, userMessage],
                stream: true,
                temperature: 0.1
            }, {
                responseType: 'stream'
            });

            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let jsonBuffer = '';
            let fullResponse = '';
            let foundStart = false;

            const processBuffer = () => {
                const lines = buffer.split('\n\n');
                buffer = lines.pop() || ''; // Keep last partial chunk

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;
                    
                    const data = trimmedLine.slice(5);
                    if (data === '[DONE]') continue;
                    
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
                    }
                }
            };

            response.data.on('data', (chunk) => {
                buffer += decoder.decode(chunk);
                processBuffer();
            });

            response.data.on('end', () => {
                try {
                    console.log('\nProcessing final content...'); // Start of processing log

                    // If the buffer is empty or invalid, log it
                    if (!jsonBuffer.trim()) {
                        console.error('Error: Empty JSON buffer received');
                        onError('No valid JSON content received from the API');
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
                    console.error('Failed to parse job requirements:', error.message);
                    onError('Error parsing job requirements: ' + error.message);
                }
            });

            response.data.on('error', (err) => {
                console.error('Stream error:', err.message);
                onError('Stream error: ' + err.message);
            });

        } catch (error) {
            console.error('API error:', error.message);
            onError(error.response?.data?.error?.message || error.message);
        }
    }

    /**
     * Stream resume tailoring from Mistral API
     * @param {string} resumeContent - The original LaTeX resume content
     * @param {object} jobRequirements - The parsed job requirements
     * @param {function} onChunk - Callback function to handle each chunk of streamed data
     * @param {function} onComplete - Callback function called when streaming is complete
     * @param {function} onError - Callback function to handle errors
     */
    async streamTailorResume(resumeContent, jobRequirements, onChunk, onComplete, onError) {
        // First convert the resume content to plain text for analysis
        const plainTextResume = this.latexToPlainText(resumeContent);
        
        // Replace placeholders in prompt with properly formatted content
        const prompt = this.tailorPrompt
            .replace('[RESUME_CONTENT]', resumeContent)
            .replace('[JOB_REQUIREMENTS]', JSON.stringify(jobRequirements, null, 2));

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
                responseType: 'stream'
            });

            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let accumulatedResponse = '';

            const processBuffer = () => {
                const lines = buffer.split('\n\n');
                buffer = lines.pop() || ''; // Keep last partial chunk

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;
                    
                    const data = trimmedLine.slice(5);
                    if (data === '[DONE]') continue;
                    
                    try {
                        const json = JSON.parse(data);
                        const content = json.choices?.[0]?.delta?.content || '';
                        
                        if (content) {
                            accumulatedResponse += content;
                            onChunk(content);
                        }
                    } catch (e) {
                        console.warn('Warning: Invalid chunk received:', e.message);
                    }
                }
            };

            response.data.on('data', (chunk) => {
                buffer += decoder.decode(chunk);
                processBuffer();
            });

            response.data.on('end', () => {
                // Process any remaining data in the buffer
                if (buffer.trim()) {
                    const data = buffer.trim().slice(5);
                    try {
                        if (data && data !== '[DONE]') {
                            const json = JSON.parse(data);
                            const content = json.choices?.[0]?.delta?.content || '';
                            if (content) {
                                accumulatedResponse += content;
                                onChunk(content);
                            }
                        }
                    } catch (e) {
                        console.warn('Warning: Invalid final chunk:', e.message);
                    }
                }

                if (!accumulatedResponse.trim()) {
                    onError('No valid content received from the API');
                    return;
                }
                onComplete(accumulatedResponse);
            });

            response.data.on('error', (err) => {
                onError('Stream error: ' + err.message);
            });

            // Cleanup on errors
            response.data.on('close', () => {
                if (!accumulatedResponse.trim()) {
                    onError('Stream closed without receiving valid content');
                }
            });

        } catch (error) {
            console.error('Error setting up streaming:', error.response?.data || error.message);
            onError(error.response?.data?.error?.message || error.message);
        }
    }
}

export default MistralHelper;