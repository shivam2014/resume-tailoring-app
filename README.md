# Resume Tailoring Application

An intelligent web application that automatically tailors LaTeX resumes for specific job applications using Mistral AI. The application analyzes job descriptions, extracts key requirements, and optimizes your resume while maintaining professional LaTeX formatting.

## Key Features

- 🤖 **AI-Powered Analysis**: Intelligent job description parsing and resume optimization using Mistral AI
- 📝 **LaTeX Support**: Full LaTeX document processing with proper structure preservation
- 👀 **Real-time Preview**: Side-by-side comparison of original and modified resumes
- 🔄 **Interactive Editing**: Built-in LaTeX editor with syntax highlighting
- 📊 **Smart Formatting**: Maintains document structure while emphasizing relevant content
- 🎯 **Skill Matching**: Automatically highlights matching skills and experiences
- 📄 **PDF Generation**: One-click PDF generation with error handling
- 📱 **Responsive Design**: Works seamlessly on desktop and mobile devices
- 🧪 **Comprehensive Testing**: 100% code coverage goal with interactive reports

## Prerequisites

- Node.js v14 or higher
- LaTeX installation (TeX Live or MiKTeX)
- npm or yarn package manager
- Mistral AI API key ([Get one here](https://console.mistral.ai))

## Quick Start

1. Clone and install dependencies:
   ```bash
   git clone https://github.com/yourusername/resume-tailoring-app.git
   cd resume-tailoring-app
   npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env and add your Mistral AI API key
   ```

3. Start the application:
   ```bash
   npm start
   ```

4. Open http://localhost:3001 in your browser

## Documentation

- [Architecture Overview](docs/architecture.md)
- [API Documentation](docs/api.md)
- [Development Guide](docs/development.md)
- [Project Guide](docs/PROJECT_GUIDE.md)
- [Context Guide](docs/CONTEXT_GUIDE.md)
- [Resume Guidelines](RESUME_GUIDELINES.md)

## How It Works

1. **Upload**: Submit your LaTeX resume and target job description
2. **Analysis**: Mistral AI analyzes the job requirements
3. **Optimization**: Your resume is tailored to match the job
4. **Preview**: Review changes in raw LaTeX or readable format
5. **Generate**: Create a perfectly formatted PDF resume

## Smart Features

### Job Analysis
- Technical skill extraction
- Soft skill identification
- Experience requirement parsing
- Education requirement analysis
- Key responsibility mapping

### Resume Enhancement
- Content reorganization
- Terminology matching
- Skill highlighting
- Format preservation
- Professional styling

## Technical Stack

### Frontend
- Native JavaScript (ES6+)
- CSS3 with Variables
- HTML5
- diff2html
- Custom LaTeX parser

### Backend
- Node.js
- Express.js
- Mistral AI API
- LaTeX System
- File Management

## Testing and Quality

- Jest test framework with dual environment setup (Node.js and JSDOM)
- 100% test coverage goal
- Interactive coverage reports with file search
- Keyboard navigation through uncovered code blocks
- Comprehensive validation and error handling
- Streamlined test development process

## Security & Performance

- Automatic file cleanup
- Content validation
- Error handling
- Response caching
- Memory optimization

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Development

### Running Tests
```bash
# Run all tests
npm test

# Run specific test file
npx jest tests/your-test-file.test.js --config=jest.config.js

# Generate coverage reports
npm test -- --coverage
```

### Viewing Coverage Reports
After running tests with coverage, open `coverage/lcov-report/index.html` in your browser to view:
- Statement coverage
- Branch coverage
- Function coverage
- Line coverage

The reports include search functionality and keyboard navigation (press `n`/`j` for next, `p`/`k`/`b` for previous).

## Support

If you encounter any issues:
1. Check the [Development Guide](docs/development.md)
2. Review [common issues](docs/development.md#common-issues)
3. Open an issue on GitHub

## License

This project is licensed under the ISC License.

## Acknowledgments

- Mistral AI for the language model
- LaTeX Project for document preparation
- Node.js community
- Express.js team
- Open source contributors
