import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { marked } from 'marked'; // For Markdown processing
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { exec } from 'child_process';
import MistralHelper from './mistralHelper.js';
import { fileURLToPath } from 'url';
import { parse } from 'latex.js';

/**
 * Resume Tailoring Application Server
 *
 * Supported File Formats:
 * - .tex  - LaTeX documents
 * - .json - Structured JSON data
 * - .md   - Markdown text
 * - .txt  - Plain text
 */

// Determine dirname in a way that works in all environments
const __dirname = process.env.NODE_ENV === 'test'
  ? path.resolve('./src')
  : path.resolve();

export const app = express();
let port = 3001;

// In-memory storage for active streaming sessions
const streamingSessions = {
  analyze: new Map(),
  tailor: new Map()
};


// Function to try different ports if the current one is in use
const startServer = (initialPort) => {
    const server = app.listen(initialPort)
        .on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`Port ${initialPort} is busy, trying ${initialPort + 1}...`);
                startServer(initialPort + 1);
            } else {
                console.error('Server error:', err);
            }
        })
        .on('listening', () => {
            port = initialPort;
            console.log(`Server running at http://localhost:${port}`);
        });
    
    return server;
};

// Middleware - body parsers removed from global scope
app.use(cors());
app.use(express.static(path.join(process.cwd(), 'public')));
app.use('/views', express.static(path.join(__dirname, '../views')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/node_modules', express.static(path.join(__dirname, '../node_modules')));
// Also serve static files from the static directory if needed
app.use('/static', express.static(path.join(__dirname, '../static')));

// Ensure required directories exist
const dirs = ['public', 'public/js', 'public/css', 'uploads'].map(dir => path.join(__dirname, '..', dir));
dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `resume-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.tex', '.json', '.md', '.txt'];
        const fileExt = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(fileExt)) {
            const error = new Error(`Unsupported file format. Allowed formats: ${allowedExtensions.join(', ')}`);
            error.code = 'LIMIT_FILE_TYPE';
            return cb(error, false);
        }
        cb(null, true);
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});

// Wrapper for multer upload to handle file type validation
const uploadMiddleware = (req, res, next) => {
    upload.single('resume')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_TYPE' || err.message.includes('Unsupported file format')) {
                return res.status(400).json({
                    error: 'Unsupported file format',
                    allowedFormats: ['.tex', '.json', '.md', '.txt']
                });
            }
            return res.status(400).json({
                error: 'Invalid file upload',
                details: err.message,
                allowedFormats: ['.tex', '.json', '.md', '.txt']
            });
        }
        if (!req.file && req.method !== 'GET') {
            return res.status(400).json({
                error: 'No file uploaded',
                allowedFormats: ['.tex', '.json', '.md', '.txt']
            });
        }
        next();
    });
};

// Add body parsers for JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'views/index.html'));
});

// Handle job analysis streaming setup
app.post('/stream-analyze', express.json(), (req, res) => {
    try {
        if (!req.body.jobDescription || !req.body.apiKey) {
          return res.status(400).json({
            error: 'Missing required fields',
            details: 'Please provide job description and API key'
          });
        }

        // Create a session ID
        const newSessionId = Date.now().toString() + Math.random().toString(36).substring(2, 10);
        
        // Store the session data without resume path
        const sessionData = {
          jobDescription: req.body.jobDescription,
          apiKey: req.body.apiKey,
          analyzePrompt: req.body.analyzePrompt,
          resumePath: null, // No resume file required
          clients: [],
          isAnalyzing: false,
          jobRequirements: null,
          error: null
        };
        
        console.log(`Creating new analysis session ${newSessionId} with data:`, sessionData);
        streamingSessions.analyze.set(newSessionId, sessionData);
        
        // Return the session ID
        const response = { sessionId: newSessionId };
        console.log('Returning session response:', response);
        return res.status(200).json(response);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            error: 'Error setting up streaming session',
            details: error.message
        });
    }
});

// Initial upload and analysis (non-streaming)
app.post('/upload', uploadMiddleware, async (req, res) => {
    try {
        if (!req.file || !req.body.jobDescription || !req.body.apiKey) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                details: 'Please provide resume file, job description, and API key'
            });
        }

        const { 
            jobDescription, 
            apiKey,
            analyzePrompt,
            tailorPrompt 
        } = req.body;
        
        const resumePath = req.file.path;
        
        // Initialize Mistral helper with provided API key and custom prompts
        const mistral = new MistralHelper(apiKey, {
            analyzePrompt,
            tailorPrompt
        });
        
        console.log('Starting resume tailoring process...');
        
        // Analyze job description using Mistral AI
        console.log('Analyzing job description with Mistral AI...');
        console.log('Using custom analyze prompt:', analyzePrompt ? 'Yes' : 'No');
        const jobRequirements = await mistral.analyzeJobDescription(jobDescription);
        console.log('Job requirements analysis complete');
        
        // Read LaTeX content
        console.log('Reading resume content...');
        const resumeContent = fs.readFileSync(resumePath, 'utf-8');
        console.log('Resume content loaded');
        
        // Tailor resume using Mistral AI
        console.log('Tailoring resume with Mistral AI...');
        console.log('Using custom tailor prompt:', tailorPrompt ? 'Yes' : 'No');
        const modifiedContent = await mistral.tailorResume(resumeContent, jobRequirements);
        console.log('Resume tailoring complete');
        
        res.json({
            message: 'Resume successfully tailored',
            jobRequirements: jobRequirements,
            modifiedContent: modifiedContent
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: 'Error processing resume', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Handle streaming events for job analysis
app.get('/stream-analyze-events', async (req, res) => {
    const sessionId = req.query.sessionId;
    const session = streamingSessions.analyze.get(sessionId);
    
    console.log(`Client connecting to session ${sessionId}`);
    if (!sessionId) {
      console.error('No session ID provided');
      return res.status(400).json({
        error: 'Missing session ID'
      });
    }
    
    if (!session) {
      console.error(`Session ${sessionId} not found. Active sessions:`, Array.from(streamingSessions.analyze.keys()));
      return res.status(400).json({
        error: 'Invalid session ID'
      });
    }
    
    console.log(`Session ${sessionId} found with ${session.clients.length} existing clients`);

    // Set up SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    // Add this client to the session
    session.clients.push(res);

    // Handle client disconnect
    const handleDisconnect = () => {
        if (streamingSessions.analyze.has(sessionId)) {
            console.log(`Client disconnected from analysis session ${sessionId}`);
            const currentSession = streamingSessions.analyze.get(sessionId);
            currentSession.clients = currentSession.clients.filter(client => client !== res);
            
            // Clean up session if no clients and no results
            if (currentSession.clients.length === 0 && !currentSession.jobRequirements && !currentSession.error) {
                setTimeout(() => {
                    if (streamingSessions.analyze.has(sessionId)) {
                        streamingSessions.analyze.delete(sessionId);
                    }
                }, 1000); // Delay cleanup to handle reconnections
            }
        }
    };

    // Keep connection alive
    res.on('close', handleDisconnect);
    res.on('finish', handleDisconnect);
    res.on('error', (err) => {
        console.error(`Connection error in session ${sessionId}:`, err);
        handleDisconnect();
    });

    // Send heartbeat every 30 seconds
    const heartbeatInterval = setInterval(() => {
        if (!res.writableEnded) {
            res.write(':heartbeat\n\n');
        }
    }, 30000);

    // Clean up interval on disconnect
    res.on('close', () => clearInterval(heartbeatInterval));

    // If analysis is already complete, send the results
    if (session.jobRequirements) {
        console.log(`Sending cached analysis results for session ${sessionId}`);
        res.write(`event: complete\ndata: ${JSON.stringify({ jobRequirements: session.jobRequirements })}\n\n`);
        res.end();
        return;
    }
    
    // If an error occurred, send it
    if (session.error) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: session.error })}\n\n`);
        res.end();
        return;
    }
    
    // Start analysis if not already started
    if (!session.isAnalyzing) {
        session.isAnalyzing = true;
        
        // Send initial status
        const initialStatus = `event: status\ndata: ${JSON.stringify({ status: 'analyzing', message: 'Starting job analysis...' })}\n\n`;
        session.clients.forEach(client => client.write(initialStatus));
        
        // Initialize Mistral helper
        const mistral = new MistralHelper(session.apiKey, { analyzePrompt: session.analyzePrompt });
        console.log('API Key used for MistralHelper in /stream-analyze-events:', session.apiKey);
        // Start streaming analysis
        try {
            await mistral.streamAnalyzeJobDescription(
                session.jobDescription,
                // Handle chunks
                (chunk) => {
                    const chunkEvent = `event: chunk\ndata: ${JSON.stringify({ content: chunk })}\n\n`;
                    session.clients.forEach(client => client.write(chunkEvent));
                },
                // Handle completion
                (jobRequirements) => {
                    console.log(`Analysis complete for session ${sessionId}`);
                    session.jobRequirements = jobRequirements;
                    const completeEvent = `event: complete\ndata: ${JSON.stringify({ jobRequirements })}\n\n`;
                    session.clients.forEach(client => client.write(completeEvent));
                    session.clients.forEach(client => client.end());
                },
                // Handle errors
                (error) => {
                    console.error(`Error in analysis session ${sessionId}:`, error);
                    session.error = error;
                    const errorEvent = `event: error\ndata: ${JSON.stringify({ error })}\n\n`;
                    session.clients.forEach(client => client.write(errorEvent));
                    session.clients.forEach(client => client.end());
                }
            );
        } catch (error) {
            console.error(`Critical error in analysis session ${sessionId}:`, error);
            const errorEvent = `event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`;
            session.clients.forEach(client => client.write(errorEvent));
            session.clients.forEach(client => client.end());
        }
    }
});

// Modified: Store streaming session for resume tailoring
app.post('/stream-tailor', uploadMiddleware, (req, res) => {
    try {
        console.log('Starting /stream-tailor request');
        console.log('Request body:', req.body);
        console.log('Uploaded file:', req.file);

        // Validate required fields with detailed error messages
        const missingFields = [];
        if (!req.file) missingFields.push('resume file');
        if (!req.body.requirements) missingFields.push('requirements');
        if (!req.body.apiKey) missingFields.push('API key');
        
        if (missingFields.length > 0) {
            console.log('Missing fields:', missingFields);
            // Return response immediately without processing
            return res.status(400).json({
                error: 'Missing required fields',
                details: `Please provide: ${missingFields.join(', ')}`,
                requiredFields: ['resume', 'requirements', 'apiKey']
            }).end(); // Ensure response is sent immediately
        }

        // Add timeout handling for the request
        req.setTimeout(15000, () => {
            console.warn('Request timeout');
            return res.status(408).json({
                error: 'Request timeout',
                details: 'The server took too long to process the request'
            });
        });

        let requirements;
        try {
            // Parse requirements if it's a string
            requirements = typeof req.body.requirements === 'string'
                ? JSON.parse(req.body.requirements)
                : req.body.requirements;

            // Validate message structure
            if (!requirements?.messages || !Array.isArray(requirements.messages)) {
                throw new Error('Invalid message structure');
            }
        } catch (error) {
            console.error('Error parsing requirements:', error);
            return res.status(400).json({
                error: 'Invalid requirements format',
                details: 'Requirements must be a valid JSON with messages array'
            });
        }

        const {
            apiKey,
            tailorPrompt
        } = req.body;
          console.log('API Key received in /stream-tailor:', apiKey);
          // Read and validate the uploaded file
        let resumeContent = fs.readFileSync(req.file.path, 'utf-8');
        console.log('Resume content loaded from file');
        
        // If JSON file, parse and validate
        if (path.extname(req.file.originalname).toLowerCase() === '.json') {
            try {
                const parsed = JSON.parse(resumeContent);
                resumeContent = JSON.stringify(parsed); // Re-stringify to ensure valid JSON
            } catch (error) {
                return res.status(400).json({
                    error: 'Invalid JSON format',
                    details: error.message
                });
            }
        }
        
        // Create a session ID
        const sessionId = Date.now().toString() + Math.random().toString(36).substring(2, 10);
        
        // Store the session data
        streamingSessions.tailor.set(sessionId, {
            resumeContent,
            jobRequirements: requirements,
            apiKey,
            tailorPrompt,
            clients: [],
            isTailoring: false,
            modifiedContent: null,
            error: null
        });
        
        // Return the session ID with success message
        res.status(200).json({
            sessionId,
            message: 'Tailoring session started successfully'
        });
        
    } catch (error) {
        console.error('Error in /stream-tailor:', error);
        
        // Handle file type validation and multer errors
        if (error.status === 400 || error.message.includes('Unsupported file format') ||
            error instanceof multer.MulterError) {
            return res.status(400).json({
                error: error.message || 'Invalid file type',
                allowedFormats: ['.tex', '.json', '.md', '.txt']
            });
        }

        // Handle other multer errors
        if (error instanceof multer.MulterError) {
            return res.status(400).json({
                error: error.message
            });
        }

        // Handle other errors
        res.status(500).json({
            error: 'Error setting up tailoring session',
            details: error.message
        });
    }
});

// New: Connect to stream for resume tailoring
app.get('/stream-tailor-events', (req, res) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Extract session ID from query params
    const sessionId = req.query.sessionId;
    if (!sessionId || !streamingSessions.tailor.has(sessionId)) {
        res.status(400);
        res.write(`event: error\ndata: ${JSON.stringify({ error: 'Invalid or expired session' })}\n\n`);
        res.end();
        return;
    }
    
    const session = streamingSessions.tailor.get(sessionId);
    
    // Add this client to the session
    console.log(`New client connected to tailoring session ${sessionId}`);
    session.clients.push(res);
    
    // If already tailored, send the cached results immediately
    if (session.modifiedContent) {
        console.log(`Sending cached results to client for session ${sessionId}`);
        res.write(`event: complete\ndata: ${JSON.stringify({ modifiedContent: session.modifiedContent })}\n\n`);
        res.end();
        return;
    }
    
    // If an error occurred, send it
    if (session.error) {
        console.log(`Sending error to client for session ${sessionId}:`, session.error);
        res.write(`event: error\ndata: ${JSON.stringify({ error: session.error })}\n\n`);
        res.end();
        return;
    }
    
    // Start tailoring if not already started
    if (!session.isTailoring) {
        session.isTailoring = true;
        
        // Send initial status to all clients
        const initialStatus = `event: status\ndata: ${JSON.stringify({ status: 'tailoring', message: 'Starting resume tailoring...' })}\n\n`;
        session.clients.forEach(client => {
            console.log(`Writing initial status to client`);
            client.write(initialStatus);
        });
        
        // Initialize Mistral helper
        const mistral = new MistralHelper(session.apiKey, { tailorPrompt: session.tailorPrompt });
        console.log('API Key used for MistralHelper in /stream-tailor-events:', session.apiKey);
        console.log('Mistral helper initialized for session', sessionId);
        
        // Start streaming tailoring
        mistral.streamTailorResume(
            session.resumeContent,
            session.jobRequirements,
            // Handle chunks
            (chunk) => {
                const chunkEvent = `event: chunk\ndata: ${JSON.stringify({ content: chunk })}\n\n`;
                session.clients.forEach(client => client.write(chunkEvent));
            },
            // Handle completion
            (fullResponse) => {
                // Store the results
                session.modifiedContent = fullResponse;
                
                // Send complete event to all clients
                const completeEvent = `event: complete\ndata: ${JSON.stringify({ modifiedContent: fullResponse })}\n\n`;
                session.clients.forEach(client => {
                    client.write(completeEvent);
                    client.write(`event: status\ndata: ${JSON.stringify({ status: 'tailored', message: 'Resume tailoring complete' })}\n\n`);
                    client.end();
                });
                
                // Clean up session after a delay
                setTimeout(() => {
                    streamingSessions.tailor.delete(sessionId);
                }, 10 * 60 * 1000); // 10 minutes
            },
            // Handle errors
            (error) => {
                console.error('Error in streaming tailoring:', error);
                session.error = error;
                
                // Send error to all clients
                const errorEvent = `event: error\ndata: ${JSON.stringify({ error })}\n\n`;
                session.clients.forEach(client => {
                    client.write(errorEvent);
                    client.end();
                });
                
                // Clean up session after a delay
                setTimeout(() => {
                    streamingSessions.tailor.delete(sessionId);
                }, 60 * 1000); // 1 minute
            }
        );
    }
    
    // Handle client disconnect
    const handleDisconnect = () => {
        console.log(`Client disconnected from tailoring session ${sessionId}`);
        if (streamingSessions.tailor.has(sessionId)) {
            const session = streamingSessions.tailor.get(sessionId);
            session.clients = session.clients.filter(client => client !== res);
            
            // If no clients left, clean up session
            if (session.clients.length === 0 && !session.modifiedContent && !session.error) {
                console.log(`Cleaning up tailoring session ${sessionId} with no clients`);
                streamingSessions.tailor.delete(sessionId);
            }
        }
    };

    // Set up disconnect handlers
    req.on('close', handleDisconnect);
    req.on('end', handleDisconnect);
    req.on('error', (err) => {
        console.error(`Connection error in tailoring session ${sessionId}:`, err);
        handleDisconnect();
    });

    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeatInterval = setInterval(() => {
        if (!res.writableEnded) {
            res.write(':heartbeat\n\n');
        }
    }, 30000);

    // Clean up interval on disconnect
    req.on('close', () => clearInterval(heartbeatInterval));
});

// Convert pdfmake document definition to HTML
export function generateHTMLPreview(content) {
    let html = '<div style="font-family: Arial, sans-serif; padding: 20px;">';
    
    // Handle string content
    if (typeof content === 'string') {
        html += `<p>${content}</p>`;
    }
    // Handle array content
    else if (Array.isArray(content)) {
        content.forEach(item => {
            if (typeof item === 'string') {
                html += `<p>${item}</p>`;
            } else if (item.text) {
                const styles = [];
                if (item.fontSize) styles.push(`font-size: ${item.fontSize}px`);
                if (item.bold) styles.push('font-weight: bold');
                if (item.italic) styles.push('font-style: italic');
                
                const tag = item.style === 'header' ? 'h2' : 'p';
                html += `<${tag} style="${styles.join('; ')}">${item.text}</${tag}>`;
            } else if (item.ul) {
                html += '<ul>';
                item.ul.forEach(li => {
                    html += `<li>${li}</li>`;
                });
                html += '</ul>';
            }
        });
    }
    // Handle object content
    else if (typeof content === 'object' && content.text) {
        const styles = [];
        if (content.fontSize) styles.push(`font-size: ${content.fontSize}px`);
        if (content.bold) styles.push('font-weight: bold');
        if (content.italic) styles.push('font-style: italic');
        
        const tag = content.style === 'header' ? 'h2' : 'p';
        html += `<${tag} style="${styles.join('; ')}">${content.text}</${tag}>`;
    }
    
    html += '</div>';
    return html;
}

// Generate HTML preview
app.post('/get-preview', (req, res) => {
  try {
    if (!req.body.content) {
      return res.status(400).json({
        error: 'Missing content',
        details: 'Please provide the document content'
      });
    }

    const htmlPreview = generateHTMLPreview(req.body.content);
    return res.status(200).send(htmlPreview);
  } catch (error) {
    console.error('Error generating HTML preview:', error);
    return res.status(500).json({
      error: 'Error generating HTML preview',
      details: error.message
    });
  }
});

// Generate PDF from modified content (supports multiple formats)
app.post('/generate-pdf', async (req, res) => {
    try {
        if (!req.body.content || !req.body.format) {
            return res.status(400).json({
                error: 'Missing required fields',
                details: 'Please provide content and format',
                allowedFormats: ['.tex', '.json', '.md', '.txt']
            });
        }

        const format = req.body.format.toLowerCase();
        const allowedFormats = ['.tex', '.json', '.md', '.txt'];
        
        if (!allowedFormats.includes(format)) {
            return res.status(400).json({
                error: 'Invalid file type',
                allowedFormats: allowedFormats
            });
        }

        let content;
        try {
            switch (format) {
                case '.tex':
                    content = req.body.content;
                    break;
                case '.md':
                    const { marked } = require('marked');
                    content = marked.parse(req.body.content);
                    break;
                case '.json':
                    try {
                        if (typeof req.body.content !== 'string') {
                            throw new Error('Content must be a JSON string');
                        }
                        
                        // First, try to parse the content
                        const jsonContent = JSON.parse(req.body.content);
                        
                        // Then validate it's a proper object/array
                        if (typeof jsonContent !== 'object' || jsonContent === null) {
                            throw new Error('JSON content must be an object or array');
                        }
                        
                        content = JSON.stringify(jsonContent, null, 2);
                    } catch (parseError) {
                        console.error('JSON parsing error:', parseError);
                        return res.status(500).json({
                            error: 'Failed to create PDF',
                            details: `JSON parsing error: ${parseError.message}`,
                            format: '.json'
                        });
                    }
                    break;
                case '.txt':
                default:
                    content = req.body.content;
                }
        } catch (error) {
            console.error('Detailed error during content parsing:', error);
            return res.status(500).json({
                error: 'Failed to create PDF',
                details: `Content parsing error: ${error.message}`,
                format: format
            });
        }

        try {
            console.log('Starting PDF generation for format:', format);
            console.log('Content length:', content.length);
            
            const pdfmake = require('pdfmake');
            const fonts = {
                Courier: {
                    normal: 'Courier',
                    bold: 'Courier-Bold',
                    italics: 'Courier-Oblique',
                    bolditalics: 'Courier-BoldOblique'
                },
                Helvetica: {
                    normal: 'Helvetica',
                    bold: 'Helvetica-Bold',
                    italics: 'Helvetica-Oblique',
                    bolditalics: 'Helvetica-BoldOblique'
                }
            };
            
            console.log('Initializing PDF printer');
            const printer = new pdfmake(fonts);
            
            console.log('Creating document definition');
            const docDefinition = {
                content: [
                    {
                        text: content,
                        fontSize: 12,
                        margin: [0, 0, 0, 12],
                        lineHeight: 1.5
                    }
                ],
                defaultStyle: {
                    font: 'Courier',
                    fontSize: 12
                },
                pageMargins: [40, 60, 40, 60],
                pageSize: 'A4',
                pageOrientation: 'portrait'
            };
            
            console.log('Creating PDF document');
            const pdfDoc = printer.createPdfKitDocument(docDefinition);

            console.log('Setting response headers');
            res.type('application/pdf');

            console.log('Streaming PDF to response');
            pdfDoc.pipe(res);
            pdfDoc.end();

            pdfDoc.on('error', (error) => {
                console.error('PDF stream error:', error);
                console.error('Error stack:', error.stack);
                if (!res.headersSent) {
                    res.status(500).json({
                        error: 'Failed to create PDF',
                        details: error.message,
                        format: format
                    });
                }
            });

            console.log('PDF generation completed successfully');
        } catch (error) {
            console.error('PDF generation error:', error);
            if (!res.headersSent) {
                return res.status(500).json({
                    error: 'Failed to create PDF',
                    details: error.message
                });
            }
        }
    } catch (error) {
        console.error('Error in PDF generation:', error);
        if (!res.headersSent) {
            return res.status(500).json({
                error: 'Failed to create PDF',
                details: error.message
            });
        }
    }
});

// Add error handler for missing sessions
app.use((err, req, res, next) => {
  if (err.message && err.message.includes('Session not found')) {
    return res.status(400).json({
      error: 'Invalid session',
      details: err.message
    });
  }
  next(err);
});

// Add authentication error handler
app.use((err, req, res, next) => {
  if (err.isAuthError) {
    return res.status(401).json({
      error: 'Authentication failed',
      details: 'Please check your API key'
    });
  }
  next(err);
});

// Clean up old files periodically (keep files for 24 hours)
export async function cleanupOldFiles() {
    const uploadsDir = path.join(__dirname, '../uploads');
    // Use a shorter timeout in test environment
    const maxAge = process.env.NODE_ENV === 'test' ? 100 : 24 * 60 * 60 * 1000;
    
    try {
        // Ensure uploads directory exists
        if (!fs.existsSync(uploadsDir)) {
            await fs.promises.mkdir(uploadsDir, { recursive: true });
            return;
        }

        const files = await fs.promises.readdir(uploadsDir);
        const now = Date.now();
        
        for (const file of files) {
            const filePath = path.join(uploadsDir, file);
            try {
                // Skip if it's a directory
                const stats = await fs.promises.lstat(filePath);
                if (stats.isDirectory()) {
                    continue;
                }

                const age = now - stats.mtime.getTime();
                if (age > maxAge) {
                    try {
                        await fs.promises.unlink(filePath);
                        console.log(`Deleted old file: ${file}`);
                    } catch (err) {
                        console.error(`Failed to delete old file ${file}:`, err);
                    }
                }
            } catch (err) {
                console.error(`Error processing file ${file}:`, err);
            }
        }
    } catch (err) {
        console.error('Error reading uploads directory:', err);
    }
}

let cleanupInterval;

if (process.env.NODE_ENV !== 'test') {
    // Run cleanup every hour
    cleanupInterval = setInterval(cleanupOldFiles, 60 * 60 * 1000);
    // Run cleanup on startup
    cleanupOldFiles();
}

// Export server starter for testing with explicit port
export const startServerForTesting = () => {
  // Don't start test server if already running
  if (process.env.NODE_ENV === 'test' && app.listening) {
    console.log('Server already running, reusing existing instance');
    return app;
  }

  console.log('Starting test server on port 3002');
  const server = startServer(3002);
  
  // Store original close method
  const originalClose = server.close;
  
  server.closeForTesting = () => {
    return new Promise((resolve) => {
      // Clear cleanup interval if it exists
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
      }
      
      // Close all active streaming sessions
      streamingSessions.analyze.clear();
      streamingSessions.tailor.clear();
      
      // Forcefully close all connections
      if (server.listening) {
        server.closeAllConnections();
      }

      // Close the server with timeout
      const closeTimeout = setTimeout(() => {
        if (server.listening) {
          server.closeAllConnections();
          originalClose.call(server);
        }
        resolve();
      }, 1000);

      // Close the server
      originalClose.call(server, () => {
        clearTimeout(closeTimeout);
        console.log('Test server closed');
        resolve();
      });
    });
  };
  
  return server;
};

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
    startServer(port);
}
