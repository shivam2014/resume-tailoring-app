import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { exec } from 'child_process';
import MistralHelper from './mistralHelper.js';
import { fileURLToPath } from 'url';
import { parse } from 'latex.js';

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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
        if (path.extname(file.originalname) !== '.tex') {
            const error = new Error('Only .tex files are allowed');
            return cb(error, false);
        }
        cb(null, true);
    }
});

// Wrapper for multer upload to handle file type validation
const uploadMiddleware = (req, res, next) => {
    upload.single('resumeFile')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        if (!req.file && req.method !== 'GET') {
            return res.status(400).json({ error: 'Only .tex files are allowed' });
        }
        next();
    });
};

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'views/index.html'));
});

// Handle form-urlencoded data for /stream-analyze
app.post('/stream-analyze', express.urlencoded({ extended: true }), (req, res) => {
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

// Modified: Store streaming session data and return a session ID
app.post('/stream-analyze', (req, res) => {
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
          apiKeyReceived: req.body.apiKey, // Log the API key
          clients: [],
          isAnalyzing: false,
          jobRequirements: null,
          error: null
        };
        
        console.log(`Creating new analysis session ${newSessionId} with data:`, sessionData);
        streamingSessions.analyze.set(newSessionId, sessionData);
        
        // Log all active sessions
        console.log('Active sessions:', Array.from(streamingSessions.analyze.keys()));
        
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

        if (!req.file || !req.body.requirements || !req.body.apiKey) {
            return res.status(400).json({
                error: 'Missing required fields',
                details: 'Please provide resume file, requirements, and API key'
            });
        }

        const {
            requirements,
            apiKey,
            tailorPrompt
          } = req.body;
          console.log('API Key received in /stream-tailor:', apiKey);
          // Read the uploaded file
        const resumeContent = fs.readFileSync(req.file.path, 'utf-8');
        console.log('Resume content loaded from file');
        
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
        if (error.status === 400 || error.message === 'Only .tex files are allowed' ||
            error instanceof multer.MulterError) {
            return res.status(400).json({
                error: 'Invalid file type. Only .tex files are allowed'
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

// Generate PDF from modified content using LaTeX.js
app.post('/generate-pdf', async (req, res) => {
    try {
        if (!req.body.content) {
            return res.status(400).json({
                error: 'Missing content',
                details: 'Please provide the LaTeX content'
            });
        }

        const LaTeX = (await import('latex.js')).default;
        try {
            console.log('Received LaTeX content:', req.body.content);
            
            const pdfmake = require('pdfmake');
            const fonts = {
                Roboto: {
                    normal: 'Helvetica',
                    bold: 'Helvetica-Bold',
                    italics: 'Helvetica-Oblique',
                    bolditalics: 'Helvetica-BoldOblique'
                }
            };
            
            const printer = new pdfmake(fonts);
            const docDefinition = {
                content: [
                    { text: req.body.content, fontSize: 12 }
                ]
            };
            
            try {
                const pdfDoc = printer.createPdfKitDocument(docDefinition);
                res.type('application/pdf');
                pdfDoc.pipe(res);
                pdfDoc.end();
            } catch (error) {
                console.error('PDF creation error:', error);
                return res.status(500).json({
                    error: 'Failed to create PDF',
                    details: error.message
                });
            }
        } catch (error) {
            console.error('PDF generation error:', error);
            console.error('Error stack:', error.stack);
            throw new Error(`Failed to generate PDF: ${error.message}`);
        }
    } catch (error) {
      // Log error but don't send response yet
      console.error('Error generating PDF:', error);
      // Make sure we haven't already sent a response
      if (!res.headersSent) {
        return res.status(500).json({
          error: 'Error generating PDF',
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
