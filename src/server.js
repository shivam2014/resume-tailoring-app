import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { exec } from 'child_process';
import MistralHelper from './mistralHelper.js';
import { fileURLToPath } from 'url';

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

// Only check for pdflatex in non-test environment
if (process.env.NODE_ENV !== 'test') {
    // Check if pdflatex is installed
    exec('pdflatex --version', (error) => {
        if (error) {
            console.error('Error: pdflatex is not installed or not in PATH');
            console.error('Please install TeX Live or MiKTeX and ensure pdflatex is available');
            process.exit(1);
        }
    });
}

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
app.use(express.static(path.join(__dirname, '../public')));
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
    res.sendFile(path.join(__dirname, '../views/index.html'));
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

// Generate PDF from modified content
app.post('/generate-pdf', async (req, res) => {
    try {
        if (!req.body.content) {
            return res.status(400).json({ 
                error: 'Missing content',
                details: 'Please provide the LaTeX content'
            });
        }

        const timestamp = Date.now();
        const texPath = path.join(__dirname, `../uploads/resume-${timestamp}-final.tex`);
        
        // Save the content to a new .tex file
        fs.writeFileSync(texPath, req.body.content);
        console.log('Saved modified content to:', texPath);
        
        // Compile LaTeX to PDF
        console.log('Compiling LaTeX to PDF...');
        const { pdf: pdfPath, log: logContent } = await compileLaTeX(texPath);
        console.log('PDF compilation successful:', pdfPath);

        // Extract just the filename from the full path
        const pdfFilename = path.basename(pdfPath);
        console.log('PDF filename:', pdfFilename);
        
        res.set('Content-Type', 'application/pdf');
        res.sendFile(pdfPath, (err) => {
            if (err) {
                console.error('Error sending PDF:', err);
                return res.status(500).json({
                    error: 'Error sending PDF',
                    details: err.message
                });
            }
            
            // Clean up the generated files
            fs.unlinkSync(texPath);
            fs.unlinkSync(pdfPath);
        });
    } catch (error) {
        if (error.latexLog) {
            // LaTeX compilation error - return 400
            res.status(400).json({
                error: 'LaTeX compilation error',
                details: error.message,
                latexLog: error.latexLog
            });
        } else {
            // Other errors - return 500
            console.error('Error:', error);
            res.status(500).json({
                error: 'Error generating PDF',
                details: error.message
            });
        }
    }
});

async function compileLaTeX(texPath) {
    return new Promise((resolve, reject) => {
        const workDir = path.dirname(texPath);
        const texFile = path.basename(texPath);
        const logFile = texFile.replace('.tex', '.log');
        const auxFile = texFile.replace('.tex', '.aux');
        const outFile = texFile.replace('.tex', '.out');
        
        const options = {
            cwd: workDir,
            timeout: 60000 // Increase timeout to 60 seconds
        };

        // Clean up auxiliary files from previous runs
        const cleanupFiles = [auxFile, outFile, logFile].map(file => path.join(workDir, file));
        cleanupFiles.forEach(file => {
            if (fs.existsSync(file)) {
                try {
                    fs.unlinkSync(file);
                } catch (err) {
                    console.warn(`Warning: Could not remove auxiliary file ${file}:`, err);
                }
            }
        });

        console.log('Running first LaTeX pass...');
        console.log('Working directory:', workDir);
        console.log('TeX file:', texFile);

        // First pass
        exec(`pdflatex -interaction=nonstopmode -file-line-error -halt-on-error ${texFile}`, options, (error1, stdout1, stderr1) => {
            // Read log file if it exists
            const logPath = path.join(workDir, logFile);
            const logContent = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf-8') : '';
            
            if (error1) {
                console.error('First LaTeX compilation error');
                console.error('stdout:', stdout1);
                console.error('stderr:', stderr1);
                console.error('Log file content:', logContent);
                
                // Try to extract meaningful error message from log
                const errorMessage = extractLatexError(logContent);
                const errorObj = new Error(errorMessage || 'LaTeX compilation failed');
                errorObj.latexLog = logContent;
                return reject(errorObj);
            }
            
            console.log('Running second LaTeX pass...');
            // Second pass
            exec(`pdflatex -interaction=nonstopmode -file-line-error -halt-on-error ${texFile}`, options, (error2, stdout2, stderr2) => {
                const finalLogContent = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf-8') : '';
                
                if (error2) {
                    console.error('Second LaTeX compilation error');
                    console.error('stdout:', stdout2);
                    console.error('stderr:', stderr2);
                    console.error('Log file content:', finalLogContent);
                    
                    // Try to extract meaningful error message from log
                    const errorMessage = extractLatexError(finalLogContent);
                    const errorObj = new Error(errorMessage || 'LaTeX compilation failed');
                    errorObj.latexLog = finalLogContent;
                    reject(errorObj);
                } else {
                    const pdfPath = path.join(workDir, texFile.replace('.tex', '.pdf'));
                    if (!fs.existsSync(pdfPath)) {
                        const errorObj = new Error('PDF file not created despite successful compilation');
                        errorObj.latexLog = finalLogContent;
                        reject(errorObj);
                    } else {
                        resolve({
                            pdf: pdfPath,
                            log: finalLogContent
                        });
                    }
                }
            });
        });
    });
}

// Helper function to extract meaningful error messages from LaTeX log
function extractLatexError(logContent) {
    if (!logContent) return null;
    
    // Common LaTeX error patterns
    const errorPatterns = [
        /^!(.*?)\n/m,  // Basic error message
        /^Error:(.*?)\n/m,  // Basic error pattern
        /^LaTeX Error:(.*?)\n/m,  // LaTeX specific errors
        /^! LaTeX Error:(.*?)\n/m,  // Another LaTeX error format
        /^! Package (.*?) Error:(.*?)\n/m,  // Package specific errors
        /^No file (.*?)\./m,  // Missing file errors
        /^! Undefined control sequence\.\n\\([^\n]+)/m  // Undefined command errors
    ];
    
    for (const pattern of errorPatterns) {
        const match = logContent.match(pattern);
        if (match) {
            // Clean up the error message
            return match[1]
                .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
                .trim();
        }
    }
    
    return null;
}

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

// Run cleanup every hour
setInterval(cleanupOldFiles, 60 * 60 * 1000);
// Run cleanup on startup
cleanupOldFiles();

// Start server with port fallback
startServer(port);

// Export server starter for testing with explicit port
export const startServerForTesting = () => {
  console.log('Starting test server on port 3002');
  return startServer(3002);
};

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
    startServer(port);
}