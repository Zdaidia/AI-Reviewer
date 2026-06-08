# Dev Quality Inspector

A desktop/IDE-style development tool for code quality inspection and automated testing.

## Tech Stack

- **Electron** - Desktop application framework
- **Node.js** - Backend runtime
- **React** - UI framework
- **Tailwind CSS** - Styling
- **Monaco Editor** - Code editor
- **Playwright** - Browser automation
- **GPT API** - AI-powered code fixing (configurable)

## Supported Languages

- JavaScript
- TypeScript
- Dart
- Vue

## Core Features

1. **Code Scanning** - Automatically scan code to find rule violations
2. **TODO Generation** - Generate TODO comments based on rules
3. **Rule-based Fixing** - Fix code issues according to rules
4. **AI Auto-fixing** - Use GPT to intelligently fix code issues
5. **Project Running** - Run local projects and open browser
6. **Excel Test Import** - Import Excel test cases
7. **Test Generation** - Generate automated test scripts from Excel
8. **Test Execution** - Run tests and display results

## Function Buttons

- Add File/Folder
- Scan Code
- Add TODO
- Fix TODO
- AI Fix TODO
- Run Project
- Import Excel Test
- Generate Test Case
- Run Test

## Getting Started

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev:react

# Build for production
npm run build

# Build Electron app
npm run build:electron
```

## Project Structure

```
dev-quality-inspector/
├── src/
│   ├── components/          # React components
│   ├── core/               # Core modules
│   │   ├── electron/       # Electron main process
│   │   ├── scanner/        # Code scanning engine
│   │   ├── todo/           # TODO generation & fixing
│   │   ├── runner/         # Project runner
│   │   ├── testing/        # Test module
│   │   └── dependency/     # Dependency loader
│   └── assets/             # Static assets
├── package.json
└── README.md
```

## License

MIT
