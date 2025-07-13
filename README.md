# ClaudxGUI

A desktop GUI for Claude that's built for developers. Chat with Claude while working on your projects, with proper file management and security controls.

## Features

**Security & Permissions**
- Toggle what Claude can do (write files, edit, delete, run commands)
- Real-time monitoring of file changes
- Per-project permission settings

**Chat Interface** 
- Project-based conversations that persist
- Reference files with `@filename`
- Upload and analyze images
- Syntax highlighting for code

**Project Management**
- File tree browser
- Built-in code editor
- See what files Claude modified
- Multiple terminal tabs

**Developer Tools**
- Integrated terminal (supports WSL, PowerShell, Bash, etc.)
- Live diff viewer for file changes
- Real-time notifications of Claude's actions

## Installation

**Prerequisites:**
- Node.js 18+
- Claude CLI ([install guide](https://docs.anthropic.com/en/docs/claude-code))

**Install:**
```bash
git clone https://github.com/yourusername/ClaudxGUI.git
cd ClaudxGUI
npm install
```

**Configure Claude:**
```bash
claude auth login
```

## Usage

1. Start the backend:
   ```bash
   npm run dev:server
   ```

2. Start the frontend:
   ```bash
   npm run dev
   ```

3. Open http://localhost:5173

**Getting Started:**
- Select your project folder
- Configure permissions in settings
- Start chatting with Claude about your code
- Use `@filename` to reference specific files
- Check the file tree to see changes Claude makes

## Development

```bash
npm run dev        # Start frontend
npm run dev:server # Start backend  
npm run build      # Build for production
npm run lint       # Run linter
```

**Project structure:**
- `src/` - React frontend
- `server/` - Node.js backend
- `data/` - SQLite database and uploads (not committed)

## Contributing

Pull requests welcome. Open an issue for major changes.

## License

MIT