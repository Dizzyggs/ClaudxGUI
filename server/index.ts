import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { URL, fileURLToPath } from 'url';
import multer from 'multer';
import { diffCapture } from './diffCapture.js';
import { PermissionManager } from './permissionManager.js';
import { FilesystemProtection } from './filesystemProtection.js';
import { ToolsFilter } from './toolsFilter.js';
import sharp from 'sharp';
import { db, Project, Message, ImageFile } from './database.js';
import { terminalManager } from './terminalManager.js';
import { shellManager } from './shellManager.js';
import chokidar from 'chokidar';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

// Configuration
const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT || '3600000'); // 1 hour in milliseconds
const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL || '600000'); // 10 minutes in milliseconds

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Create upload directories
const IMAGES_DIR = path.join(__dirname, '..', 'data', 'images');
const TEMP_DIR = path.join(IMAGES_DIR, 'temp');

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projectId = req.params.projectId || req.body.projectId;
    if (projectId) {
      const projectDir = path.join(IMAGES_DIR, `project-${projectId}`);
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }
      cb(null, projectDir);
    } else {
      cb(null, TEMP_DIR);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `image-${uuidv4()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if file is an image
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Projects are now managed by the database
// const projects: Project[] = []; // Removed in-memory storage

interface WebSocketClient {
  ws: WebSocket;
  project?: Project;
  sessionId?: string;
  projectPath?: string;
}

interface ActiveProcess {
  process: ChildProcess;
  sessionId: string;
  clientId: string;
  startTime: number;
  projectPath: string;
}

const clients = new Map<string, WebSocketClient>();
const activeProcesses = new Map<string, ActiveProcess>();

// Permission manager is now disabled - using settings-only permissions
// const permissionManager = new PermissionManager(...);

// Initialize filesystem protection
let filesystemProtection: FilesystemProtection | null = null;

// Initialize tools filter with secure default settings (all dangerous tools disabled)
const toolsFilter = new ToolsFilter({
  allowedTools: [
    'Read', 'LS', 'Grep', 'Glob', 'TodoRead', 'TodoWrite', 'Task', 'WebFetch', 'WebSearch'
  ], // Enable safe analysis tools by default
  disallowedTools: [
    'Write', 'Edit', 'MultiEdit', 'Delete', 'Remove', 'Bash',
    'Bash(rm *)', 'Bash(del *)', 'Bash(delete *)', 'Bash(unlink *)',
    'Bash(erase *)', 'Bash(format *)', 'Bash(dd *)', 'Bash(sudo *)'
  ],
  skipPermissions: false
});

// File watchers for auto-refresh functionality
const fileWatchers = new Map<string, chokidar.FSWatcher>();

// Initialize file watcher for a project
const initializeFileWatcher = (projectPath: string, clientId: string) => {
  // Don't create duplicate watchers
  if (fileWatchers.has(projectPath)) {
    return;
  }

  console.log(`🔍 Starting file watcher for: ${projectPath}`);
  
  const watcher = chokidar.watch(projectPath, {
    ignored: [
      '**/node_modules/**',
      '**/.git/**',
      '**/.DS_Store',
      '**/Thumbs.db',
      '**/*.tmp',
      '**/*.log',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.nuxt/**',
      '**/coverage/**',
      '**/.nyc_output/**'
    ],
    ignoreInitial: true,
    persistent: true,
    depth: 10, // Limit recursion depth
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50
    }
  });

  watcher
    .on('add', (filePath) => {
      console.log(`📁 File added: ${filePath}`);
      broadcastFileChange(projectPath, 'file_created', filePath);
    })
    .on('change', (filePath) => {
      console.log(`📝 File changed: ${filePath}`);
      broadcastFileChange(projectPath, 'file_modified', filePath);
    })
    .on('unlink', (filePath) => {
      console.log(`🗑️ File removed: ${filePath}`);
      broadcastFileChange(projectPath, 'file_deleted', filePath);
    })
    .on('addDir', (dirPath) => {
      console.log(`📂 Directory added: ${dirPath}`);
      broadcastFileChange(projectPath, 'directory_created', dirPath);
    })
    .on('unlinkDir', (dirPath) => {
      console.log(`📂❌ Directory removed: ${dirPath}`);
      broadcastFileChange(projectPath, 'directory_deleted', dirPath);
    })
    .on('error', (error) => {
      console.error(`File watcher error for ${projectPath}:`, error);
    });

  fileWatchers.set(projectPath, watcher);
};

// Broadcast file changes to clients watching this project
const broadcastFileChange = (projectPath: string, changeType: string, filePath: string) => {
  const message = {
    type: 'file_change',
    content: {
      changeType,
      filePath,
      projectPath,
      timestamp: Date.now()
    }
  };

  // Send to all clients watching this project
  clients.forEach((client) => {
    if (client.projectPath === projectPath && client.ws.readyState === 1) {
      client.ws.send(JSON.stringify(message));
    }
  });
};

// Clean up file watcher
const cleanupFileWatcher = (projectPath: string) => {
  const watcher = fileWatchers.get(projectPath);
  if (watcher) {
    console.log(`🔍❌ Stopping file watcher for: ${projectPath}`);
    watcher.close();
    fileWatchers.delete(projectPath);
  }
};

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  isExpanded?: boolean;
}

const buildFileTree = (dirPath: string, maxDepth: number = 3, currentDepth: number = 0): FileNode[] => {
  if (currentDepth >= maxDepth) return [];
  
  try {
    const items = fs.readdirSync(dirPath);
    const nodes: FileNode[] = [];
    
    for (const item of items) {
      // Skip hidden files and common ignore patterns
      if (item.startsWith('.') || item === 'node_modules' || item === 'dist' || item === 'build') {
        continue;
      }
      
      const itemPath = path.join(dirPath, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        const children = buildFileTree(itemPath, maxDepth, currentDepth + 1);
        nodes.push({
          name: item,
          path: itemPath,
          type: 'directory',
          children,
          isExpanded: currentDepth < 2 // Auto-expand first 2 levels
        });
      } else {
        nodes.push({
          name: item,
          path: itemPath,
          type: 'file'
        });
      }
    }
    
    // Sort: directories first, then files, both alphabetically
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error('Error building file tree:', error);
    return [];
  }
};

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Test database endpoint
app.get('/api/test-db', async (_req, res) => {
  try {
    const projects = await db.getAllProjects();
    res.json({ 
      status: 'database ok', 
      projectCount: projects.length,
      projects: projects 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'database error', 
      error: error.message 
    });
  }
});

// Get tools settings
app.get('/api/tools-settings', (_req, res) => {
  try {
    const settings = toolsFilter.getSettings();
    res.json({ 
      status: 'ok',
      settings 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      error: error.message 
    });
  }
});

// Update tools settings
app.post('/api/tools-settings', (req, res) => {
  try {
    const { allowedTools, disallowedTools, skipPermissions } = req.body;
    
    // Validate input
    if (allowedTools && !Array.isArray(allowedTools)) {
      return res.status(400).json({ error: 'allowedTools must be an array' });
    }
    if (disallowedTools && !Array.isArray(disallowedTools)) {
      return res.status(400).json({ error: 'disallowedTools must be an array' });
    }
    if (skipPermissions !== undefined && typeof skipPermissions !== 'boolean') {
      return res.status(400).json({ error: 'skipPermissions must be a boolean' });
    }
    
    // Update settings
    const newSettings = {};
    if (allowedTools !== undefined) newSettings.allowedTools = allowedTools;
    if (disallowedTools !== undefined) newSettings.disallowedTools = disallowedTools;
    if (skipPermissions !== undefined) newSettings.skipPermissions = skipPermissions;
    
    toolsFilter.updateSettings(newSettings);
    
    console.log('🔧 Tools settings updated via API:', newSettings);
    
    res.json({ 
      status: 'ok',
      settings: toolsFilter.getSettings(),
      message: 'Tools settings updated successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      error: error.message 
    });
  }
});

// Sync settings from frontend localStorage (called when user sends message)
app.post('/api/sync-settings', (req, res) => {
  try {
    const { settings } = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings object' });
    }
    
    // Update server settings with frontend settings
    toolsFilter.updateSettings({
      allowedTools: settings.allowedTools || [],
      disallowedTools: settings.disallowedTools || [],
      skipPermissions: settings.skipPermissions || false
    });
    
    console.log('🔄 Settings synced from frontend:', settings);
    
    res.json({ 
      status: 'ok',
      message: 'Settings synced successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      error: error.message 
    });
  }
});

// Test images directory
app.get('/api/test-images', (_req, res) => {
  try {
    const imagesExist = fs.existsSync(IMAGES_DIR);
    const tempExist = fs.existsSync(TEMP_DIR);
    res.json({
      imagesDir: IMAGES_DIR,
      imagesExist,
      tempDir: TEMP_DIR,
      tempExist
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List projects
app.get('/api/projects', async (_req, res) => {
  try {
    const projects = await db.getAllProjects();
    res.json({ projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Create new project
app.post('/api/projects', async (req, res) => {
  console.log('Received project creation request:', req.body);
  const { name, path: projectPath } = req.body;
  
  if (!name || !projectPath) {
    console.log('Missing required fields:', { name, path: projectPath });
    return res.status(400).json({ error: 'Name and path are required' });
  }

  // Resolve relative paths to absolute paths
  const absolutePath = path.isAbsolute(projectPath) 
    ? projectPath 
    : path.resolve('/home/freddan11/projects', projectPath);

  // Check if the path exists
  if (!fs.existsSync(absolutePath)) {
    return res.status(400).json({ error: 'Project path does not exist: ' + absolutePath });
  }

  const project: Project = {
    id: uuidv4(),
    name,
    path: absolutePath,
    createdAt: new Date().toISOString()
  };

  try {
    await db.createProject(project);
    console.log('Created project:', project);
    res.json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Get file tree endpoint
app.get('/api/files/tree', (req, res) => {
  const { path: projectPath } = req.query;
  
  if (!projectPath || typeof projectPath !== 'string') {
    return res.status(400).json({ error: 'Project path is required' });
  }
  
  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: 'Project path does not exist' });
  }
  
  try {
    const fileTree = buildFileTree(projectPath);
    res.json(fileTree);
  } catch (error) {
    console.error('Error getting file tree:', error);
    res.status(500).json({ error: 'Failed to get file tree' });
  }
});

// Get file content endpoint
app.get('/api/files/content', (req, res) => {
  const { path: filePath } = req.query;
  
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).json({ error: 'File path is required' });
  }
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File does not exist' });
  }
  
  try {
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is a directory, not a file' });
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ content, path: filePath });
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({ error: 'Failed to read file' });
  }
});

// Save file content endpoint
app.put('/api/files/content', (req, res) => {
  const { path: filePath, content } = req.body;
  
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).json({ error: 'File path is required' });
  }
  
  if (content === undefined) {
    return res.status(400).json({ error: 'Content is required' });
  }
  
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, content, 'utf-8');
    res.json({ success: true, path: filePath });
  } catch (error) {
    console.error('Error writing file:', error);
    res.status(500).json({ error: 'Failed to write file' });
  }
});

// Update project
app.put('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  const { name, path: projectPath } = req.body;
  console.log('Updating project:', id, req.body);
  
  if (!name || !projectPath) {
    return res.status(400).json({ error: 'Name and path are required' });
  }

  // Resolve relative paths to absolute paths
  const absolutePath = path.isAbsolute(projectPath) 
    ? projectPath 
    : path.resolve('/home/freddan11/projects', projectPath);

  // Check if the path exists
  if (!fs.existsSync(absolutePath)) {
    return res.status(400).json({ error: 'Project path does not exist: ' + absolutePath });
  }
  
  try {
    const existingProject = await db.getProject(id);
    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const updatedProject: Project = {
      ...existingProject,
      name,
      path: absolutePath,
      updatedAt: new Date().toISOString()
    };
    
    await db.updateProject(id, updatedProject);
    console.log('Updated project:', updatedProject);
    
    res.json(updatedProject);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Delete project
app.delete('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  console.log('Deleting project:', id);
  
  try {
    const project = await db.getProject(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    await db.deleteProject(id);
    console.log('Deleted project:', project);
    
    res.json({ message: 'Project deleted successfully', project });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// File listing endpoint
app.get('/api/projects/files', async (req, res) => {
  const { path: projectPath } = req.query;
  
  if (!projectPath) {
    return res.status(400).json({ error: 'Project path is required' });
  }
  
  try {
    const listFiles = (dir: string, basePath = ''): string[] => {
      const files: string[] = [];
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const relativePath = path.join(basePath, item);
        
        // Skip hidden files and common build/cache directories
        if (item.startsWith('.') || ['node_modules', 'dist', 'build', '.git'].includes(item)) {
          continue;
        }
        
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          files.push(...listFiles(itemPath, relativePath));
        } else {
          files.push(relativePath);
        }
      }
      
      return files;
    };
    
    const files = listFiles(projectPath as string);
    res.json({ files });
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Terminal endpoints

// Get available shells
app.get('/api/terminal/shells', async (req, res) => {
  try {
    const shells = await shellManager.getAvailableShells();
    const platformInfo = await shellManager.detectPlatform();
    
    res.json({
      shells,
      platform: platformInfo.platform,
      defaultShell: platformInfo.defaultShell,
      wslDistros: platformInfo.wslDistros
    });
  } catch (error) {
    console.error('Error getting available shells:', error);
    res.status(500).json({ error: 'Failed to get available shells' });
  }
});

// Get terminal sessions
app.get('/api/terminal/sessions', (req, res) => {
  try {
    const sessions = terminalManager.getAllActiveSessions().map(session => ({
      id: session.id,
      shellProfile: {
        id: session.shellProfile.id,
        name: session.shellProfile.name,
        type: session.shellProfile.type
      },
      projectPath: session.projectPath,
      createdAt: session.createdAt
    }));
    
    res.json({ sessions });
  } catch (error) {
    console.error('Error getting terminal sessions:', error);
    res.status(500).json({ error: 'Failed to get terminal sessions' });
  }
});

// Get terminal session info
app.get('/api/terminal/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const sessionInfo = terminalManager.getSessionInfo(sessionId);
    if (!sessionInfo) {
      return res.status(404).json({ error: 'Terminal session not found' });
    }
    
    res.json(sessionInfo);
  } catch (error) {
    console.error('Error getting terminal session info:', error);
    res.status(500).json({ error: 'Failed to get terminal session info' });
  }
});

// Delete terminal session
app.delete('/api/terminal/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const success = terminalManager.destroySession(sessionId);
    if (!success) {
      return res.status(404).json({ error: 'Terminal session not found' });
    }
    
    res.json({ message: 'Terminal session destroyed successfully' });
  } catch (error) {
    console.error('Error destroying terminal session:', error);
    res.status(500).json({ error: 'Failed to destroy terminal session' });
  }
});

// Get terminal statistics
app.get('/api/terminal/stats', (req, res) => {
  try {
    const stats = terminalManager.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting terminal stats:', error);
    res.status(500).json({ error: 'Failed to get terminal stats' });
  }
});

// Chat history endpoints

// Get chat history for a project
app.get('/api/projects/:id/messages', async (req, res) => {
  const { id } = req.params;
  console.log('Fetching chat history for project:', id);
  
  try {
    const project = await db.getProject(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const messages = await db.getProjectMessages(id);
    
    // Get images for each message
    const messagesWithImages = await Promise.all(
      messages.map(async (message) => {
        const images = await db.getMessageImages(message.id);
        return {
          ...message,
          images: images.map(img => ({
            id: img.id,
            filename: img.filename,
            url: `/api/images/${img.id}`,
            thumbnailUrl: `/api/images/${img.id}/thumbnail`
          }))
        };
      })
    );
    
    res.json({ messages: messagesWithImages });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// Save a message to chat history
app.post('/api/projects/:id/messages', async (req, res) => {
  const { id } = req.params;
  const { sender, text } = req.body;
  
  if (!sender || !text) {
    return res.status(400).json({ error: 'Sender and text are required' });
  }
  
  if (!['user', 'claude'].includes(sender)) {
    return res.status(400).json({ error: 'Invalid sender. Must be "user" or "claude"' });
  }
  
  try {
    const project = await db.getProject(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const message: Message = {
      id: uuidv4(),
      projectId: id,
      sender: sender as 'user' | 'claude',
      text,
      createdAt: new Date().toISOString()
    };
    
    await db.saveMessage(message);
    console.log('Saved message:', message);
    
    res.json({ message });
  } catch (error) {
    console.error('Error saving message:', error);
    res.status(500).json({ error: 'Failed to save message' });
  }
});

// Clear chat history for a project
app.delete('/api/projects/:id/messages', async (req, res) => {
  const { id } = req.params;
  console.log('Clearing chat history for project:', id);
  
  try {
    const project = await db.getProject(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    await db.deleteProjectMessages(id);
    console.log('Cleared chat history for project:', id);
    
    res.json({ message: 'Chat history cleared successfully' });
  } catch (error) {
    console.error('Error clearing chat history:', error);
    res.status(500).json({ error: 'Failed to clear chat history' });
  }
});

// Image upload endpoints

// Upload image for a project
app.post('/api/projects/:projectId/images', upload.single('image'), async (req, res) => {
  const { projectId } = req.params;
  console.log('Image upload request for project:', projectId);
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    const project = await db.getProject(projectId);
    if (!project) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Generate thumbnail
    const thumbnailPath = req.file.path.replace(path.extname(req.file.path), '_thumb.jpg');
    await sharp(req.file.path)
      .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);
    
    const image: ImageFile = {
      id: uuidv4(),
      projectId,
      filename: req.file.originalname,
      filepath: req.file.path,
      mimeType: req.file.mimetype,
      size: req.file.size,
      createdAt: new Date().toISOString()
    };
    
    await db.saveImage(image);
    console.log('Image saved:', image);
    
    res.json({ 
      image: {
        id: image.id,
        filename: image.filename,
        mimeType: image.mimeType,
        size: image.size,
        url: `/api/images/${image.id}`,
        thumbnailUrl: `/api/images/${image.id}/thumbnail`
      }
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Upload image from clipboard data
app.post('/api/projects/:projectId/images/clipboard', async (req, res) => {
  const { projectId } = req.params;
  const { imageData, mimeType, filename } = req.body;
  
  try {
    if (!imageData || !mimeType) {
      return res.status(400).json({ error: 'Image data and mimeType are required' });
    }
    
    const project = await db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Decode base64 image data
    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Create project directory
    const projectDir = path.join(IMAGES_DIR, `project-${projectId}`);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    
    // Generate filename
    const ext = mimeType === 'image/png' ? '.png' : '.jpg';
    const imageFilename = `image-${uuidv4()}${ext}`;
    const filepath = path.join(projectDir, imageFilename);
    
    // Write image file
    fs.writeFileSync(filepath, buffer);
    
    // Generate thumbnail
    const thumbnailPath = filepath.replace(ext, '_thumb.jpg');
    await sharp(filepath)
      .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);
    
    const image: ImageFile = {
      id: uuidv4(),
      projectId,
      filename: filename || `pasted-image${ext}`,
      filepath,
      mimeType,
      size: buffer.length,
      createdAt: new Date().toISOString()
    };
    
    await db.saveImage(image);
    console.log('Clipboard image saved:', image);
    
    res.json({ 
      image: {
        id: image.id,
        filename: image.filename,
        mimeType: image.mimeType,
        size: image.size,
        url: `/api/images/${image.id}`,
        thumbnailUrl: `/api/images/${image.id}/thumbnail`
      }
    });
  } catch (error) {
    console.error('Error uploading clipboard image:', error);
    res.status(500).json({ error: 'Failed to upload clipboard image' });
  }
});

// Serve image files
app.get('/api/images/:imageId', async (req, res) => {
  const { imageId } = req.params;
  
  try {
    const image = await db.getImage(imageId);
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    if (!fs.existsSync(image.filepath)) {
      return res.status(404).json({ error: 'Image file not found' });
    }
    
    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${image.filename}"`);
    res.sendFile(path.resolve(image.filepath));
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

// Serve image thumbnails
app.get('/api/images/:imageId/thumbnail', async (req, res) => {
  const { imageId } = req.params;
  
  try {
    const image = await db.getImage(imageId);
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    const thumbnailPath = image.filepath.replace(path.extname(image.filepath), '_thumb.jpg');
    if (!fs.existsSync(thumbnailPath)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }
    
    res.setHeader('Content-Type', 'image/jpeg');
    res.sendFile(path.resolve(thumbnailPath));
  } catch (error) {
    console.error('Error serving thumbnail:', error);
    res.status(500).json({ error: 'Failed to serve thumbnail' });
  }
});

// Get project images
app.get('/api/projects/:projectId/images', async (req, res) => {
  const { projectId } = req.params;
  
  try {
    const project = await db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const images = await db.getProjectImages(projectId);
    const imageList = images.map(img => ({
      id: img.id,
      filename: img.filename,
      mimeType: img.mimeType,
      size: img.size,
      createdAt: img.createdAt,
      url: `/api/images/${img.id}`,
      thumbnailUrl: `/api/images/${img.id}/thumbnail`
    }));
    
    res.json({ images: imageList });
  } catch (error) {
    console.error('Error fetching project images:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ 
  server,
  verifyClient: (info) => {
    const url = new URL(info.req.url!, `http://${info.req.headers.host}`);
    return url.pathname === '/ws' || url.pathname === '/chat';
  }
});


async function sendToClient(clientId: string, type: string, content: string | object, sessionId?: string) {
  console.log('sendToClient called:', { clientId, type, contentType: typeof content, sessionId });
  const client = clients.get(clientId);
  if (client && client.ws.readyState === WebSocket.OPEN) {
    const message = JSON.stringify({ type, content, sessionId });
    const contentPreview = typeof content === 'string' ? content.substring(0, 100) : JSON.stringify(content).substring(0, 100);
    console.log('Sending WebSocket message:', { type, contentPreview });
    client.ws.send(message);
    
    // Save Claude responses to database
    if (type === 'claude_response' && client.project?.id) {
      try {
        const claudeMessage: Message = {
          id: uuidv4(),
          projectId: client.project.id,
          sender: 'claude',
          text: content,
          createdAt: new Date().toISOString()
        };
        await db.saveMessage(claudeMessage);
        console.log('Saved Claude response to database');
      } catch (error) {
        console.error('Error saving Claude response:', error);
      }
    }
  } else {
    console.log('Cannot send to client:', {
      hasClient: !!client,
      readyState: client?.ws.readyState
    });
  }
}

async function abortSession(sessionId: string) {
  const processInfo = activeProcesses.get(sessionId);
  if (processInfo) {
    const elapsed = Date.now() - processInfo.startTime;
    console.log('Aborting session after', Math.round(elapsed / 1000), 'seconds:', sessionId);
    processInfo.process.kill('SIGTERM');
    activeProcesses.delete(sessionId);
    // permissionManager.clearSessionPermissions(sessionId); // Disabled - using settings-only permissions
    await sendToClient(processInfo.clientId, 'claude_error', 'Session aborted by user', sessionId);
  }
}

async function cleanupExpiredSessions() {
  const now = Date.now();
  
  for (const [sessionId, processInfo] of activeProcesses.entries()) {
    const elapsed = now - processInfo.startTime;
    if (elapsed > SESSION_TIMEOUT) {
      console.log('Cleaning up expired session after', Math.round(elapsed / 1000 / 60), 'minutes:', sessionId);
      processInfo.process.kill('SIGTERM');
      activeProcesses.delete(sessionId);
      // permissionManager.clearSessionPermissions(sessionId); // Disabled - using settings-only permissions
      await sendToClient(processInfo.clientId, 'claude_error', `Session timed out after ${Math.round(elapsed / 1000 / 60)} minutes`, sessionId);
    }
  }
}

// Clean up expired sessions periodically
setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL);

wss.on('connection', (ws, req) => {
  const clientId = uuidv4();
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const connectionType = url.pathname;
  
  clients.set(clientId, { ws });
  
  console.log('Client connected:', clientId, 'Type:', connectionType);
  
  ws.on('message', async (message) => {
    console.log('Raw message received:', message.toString());
    try {
      const data = JSON.parse(message.toString());
      console.log('Parsed message:', data);
      const client = clients.get(clientId);
      
      if (!client) {
        console.log('Client not found:', clientId);
        return;
      }
      
      if (data.type === 'project_selected') {
        console.log('Project selected:', data.project.name);
        client.project = data.project;
        
        // Start Claude CLI process for this project
        let projectPath = data.project.path;
        console.log('Original project path:', projectPath);
        
        // If it's a relative path, don't resolve relative to current working directory
        // Instead, treat it as relative to the parent directory of projects
        if (projectPath && !path.isAbsolute(projectPath)) {
          console.log('Path is relative, resolving...');
          // If it looks like a simple folder name, assume it's in the projects directory
          if (!projectPath.includes('/')) {
            projectPath = path.resolve('/home/freddan11/projects', projectPath);
            console.log('Resolved as simple folder name to:', projectPath);
          } else {
            // If it has slashes, resolve relative to home directory
            projectPath = path.resolve('/home/freddan11', projectPath);
            console.log('Resolved relative to home to:', projectPath);
          }
        } else {
          console.log('Path is absolute:', projectPath);
        }
        
        if (projectPath && fs.existsSync(projectPath)) {
          client.project = { ...data.project, path: projectPath };
          client.projectPath = projectPath;
          
          // Initialize file watcher for this project
          initializeFileWatcher(projectPath, clientId);
          
          console.log(`Claude is ready for project: ${data.project.name}`);
        } else {
          console.log('Project path does not exist or is invalid:', data.project.path, 'Resolved to:', projectPath);
          await sendToClient(clientId, 'claude_error', `Project path does not exist: ${projectPath}`);
        }
      }
      
      if (data.type === 'user_message') {
        console.log('Received user message data:', {
          content: data.content?.substring(0, 100),
          hasImages: !!data.images,
          imageCount: data.images?.length || 0,
          projectId: client.project?.id
        });
        handleUserMessage(clientId, data.content, client.project?.path || process.cwd(), client.project?.id, data.images, data.mentionedFiles);
      }
      
      if (data.type === 'abort_session') {
        if (data.sessionId) {
          await abortSession(data.sessionId);
        }
      }

      // Permission response handling removed - using settings-only permissions
      // if (data.type === 'permission_response') { ... }
      
      if (data.type === 'settings_sync' || data.type === 'settings_update') {
        console.log('Received settings sync from frontend:', data.settings);
        
        // Update server settings with frontend settings
        if (data.settings) {
          toolsFilter.updateSettings({
            allowedTools: data.settings.allowedTools || [],
            disallowedTools: data.settings.disallowedTools || [],
            skipPermissions: data.settings.skipPermissions || false
          });
          
          console.log('🔄 Settings synced from frontend');
          console.log('🔧 Current settings:', toolsFilter.getSettings());
        }
      }

      // Terminal WebSocket events
      if (data.type === 'terminal_create') {
        try {
          const session = await terminalManager.createSession({
            shellId: data.shellId,
            projectPath: client.project?.path,
            clientId,
            cols: data.cols || 80,
            rows: data.rows || 24
          });

          // Set up PTY data handler
          session.pty.onData((data) => {
            sendToClient(clientId, 'terminal_output', data, session.id);
          });

          // Set up PTY exit handler
          session.pty.onExit(({ exitCode, signal }) => {
            console.log(`Terminal session ${session.id} exited with code ${exitCode}, signal ${signal}`);
            sendToClient(clientId, 'terminal_exit', 'Terminal session ended', session.id);
            terminalManager.destroySession(session.id);
          });

          // Send terminal created message with correct structure
          if (client && client.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
              type: 'terminal_created',
              sessionId: session.id,
              shellProfile: session.shellProfile
            });
            client.ws.send(message);
            console.log('Terminal session created, sent to client');
          }
        } catch (error) {
          console.error('Error creating terminal session:', error);
          sendToClient(clientId, 'terminal_error', `Failed to create terminal: ${error.message}`);
        }
      }

      if (data.type === 'terminal_input') {
        const success = terminalManager.writeToSession(data.sessionId, data.data);
        if (!success) {
          sendToClient(clientId, 'terminal_error', 'Failed to send input to terminal');
        }
      }

      if (data.type === 'terminal_resize') {
        const success = terminalManager.resizeSession(data.sessionId, {
          cols: data.cols,
          rows: data.rows
        });
        if (!success) {
          sendToClient(clientId, 'terminal_error', 'Failed to resize terminal');
        }
      }

      if (data.type === 'terminal_destroy') {
        const success = terminalManager.destroySession(data.sessionId);
        if (success) {
          // Send terminal destroyed message with correct structure
          if (client && client.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
              type: 'terminal_destroyed',
              sessionId: data.sessionId
            });
            client.ws.send(message);
            console.log('Terminal session destroyed, sent to client');
          }
        } else {
          sendToClient(clientId, 'terminal_error', 'Failed to destroy terminal session');
        }
      }
    } catch (error) {
      console.error('Error parsing message:', error, 'Raw message:', message.toString());
      // Fallback to old behavior for plain text messages
      ws.send(`Echo: ${message}`);
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected:', clientId);
    
    const client = clients.get(clientId);
    
    // Clean up any active Claude processes for this client
    for (const [sessionId, processInfo] of activeProcesses.entries()) {
      if (processInfo.clientId === clientId) {
        const elapsed = Date.now() - processInfo.startTime;
        console.log('Killing process for disconnected client after', Math.round(elapsed / 1000), 'seconds:', sessionId);
        processInfo.process.kill('SIGTERM');
        activeProcesses.delete(sessionId);
      }
    }
    
    // Clean up any terminal sessions for this client
    const destroyedSessions = terminalManager.destroySessionsByClient(clientId);
    if (destroyedSessions > 0) {
      console.log(`Cleaned up ${destroyedSessions} terminal sessions for disconnected client`);
    }
    
    // Clean up file watcher if this is the last client for this project
    if (client?.projectPath) {
      const hasOtherClientsForProject = Array.from(clients.values())
        .some(c => c.projectPath === client.projectPath && c.ws !== ws);
      
      if (!hasOtherClientsForProject) {
        cleanupFileWatcher(client.projectPath);
      }
    }
    
    clients.delete(clientId);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error for client:', clientId, error);
  });
});

async function handleUserMessage(clientId: string, content: string, projectPath: string, projectId?: string, images?: any[], mentionedFiles?: string[]) {
  console.log('User message:', content);
  console.log('Content length:', content?.length || 0);
  console.log('Content type:', typeof content);
  console.log('Images:', images?.length || 0);
  console.log('Mentioned files:', mentionedFiles?.length || 0);
  
  // Debug: Log if content is empty or undefined
  if (!content || content.trim() === '') {
    console.warn('⚠️  WARNING: Empty or undefined content received');
    console.warn('Content value:', JSON.stringify(content));
  }
  
  // 🔧 CRITICAL: Sync settings from frontend localStorage before processing
  try {
    const client = clients.get(clientId);
    if (client) {
      // Request settings from frontend
      client.ws.send(JSON.stringify({
        type: 'request_settings',
        sessionId: 'sync'
      }));
      
      // Wait a moment for settings to be received
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (error) {
    console.error('Error syncing settings:', error);
  }
  
  const sessionId = uuidv4();
  
  // Save user message to database
  let messageId: string | undefined;
  if (projectId) {
    try {
      messageId = uuidv4();
      const userMessage: Message = {
        id: messageId,
        projectId,
        sender: 'user',
        text: content,
        createdAt: new Date().toISOString()
      };
      await db.saveMessage(userMessage);
      console.log('Saved user message to database');
      
      // Link images to this message
      if (images && images.length > 0) {
        for (const image of images) {
          try {
            await db.linkImageToMessage(image.id, messageId);
            console.log('Linked image to message:', image.id, messageId);
          } catch (error) {
            console.error('Error linking image to message:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error saving user message:', error);
    }
  }
  
  // Extract image paths from content if any
  let cleanContent = content;
  let imagePaths: string[] = [];
  
  // Check if images were passed directly in the message data
  if (images && images.length > 0) {
    console.log('Processing images from message data:', images);
    imagePaths = await Promise.all(images.map(async img => {
      try {
        // Get the image from database to get the actual filepath
        const dbImage = await db.getImage(img.id);
        if (dbImage && fs.existsSync(dbImage.filepath)) {
          console.log('Found image file in database:', dbImage.filepath);
          return dbImage.filepath;
        } else {
          console.log('Image not found in database or file missing:', img.id);
          return '';
        }
      } catch (error) {
        console.error('Error getting image from database:', error);
        return '';
      }
    }));
    imagePaths = imagePaths.filter(Boolean);
  }
  
  // Also check for image paths in the content (fallback)
  const imagePathMatch = content.match(/\[Images: (.+)\]/);
  if (imagePathMatch) {
    const pathString = imagePathMatch[1];
    const additionalPaths = pathString.split(', ').map(id => {
      if (projectId) {
        const projectDir = path.join(__dirname, '..', 'data', 'images', `project-${projectId}`);
        try {
          const files = fs.readdirSync(projectDir);
          const imageFile = files.find(file => file.includes(id));
          if (imageFile) {
            return path.join(projectDir, imageFile);
          }
        } catch (error) {
          console.error('Error finding image file:', error);
        }
      }
      return '';
    }).filter(Boolean);
    
    imagePaths = [...imagePaths, ...additionalPaths];
    // Remove the image paths from content
    cleanContent = content.replace(/\[Images: .+\]/, '').trim();
  }
  
  console.log('Image paths for Claude:', imagePaths);
  
  // ✅ SECURITY CHECK: Validate permissions before Claude execution
  const toolsSettings = toolsFilter.getSettings();
  console.log('🔧 Current tools filter settings:', toolsSettings);
  
  // Pre-check if user is trying to do something that requires disabled permissions
  const userMessage = cleanContent.toLowerCase();
  const blockedActions = [];
  
  if ((userMessage.includes('create') || userMessage.includes('write') || userMessage.includes('new file')) && 
      !toolsFilter.isToolAllowed('Write')) {
    blockedActions.push({ action: 'create files', permission: 'Write Files' });
  }
  
  if ((userMessage.includes('edit') || userMessage.includes('modify') || userMessage.includes('update')) && 
      !userMessage.includes('delete') && !userMessage.includes('remove') && 
      !toolsFilter.isToolAllowed('Edit')) {
    blockedActions.push({ action: 'edit files', permission: 'Edit Files' });
  }
  
  if ((userMessage.includes('delete') || userMessage.includes('remove') || userMessage.includes('rm ')) && 
      !toolsFilter.isToolAllowed('Delete') && !toolsFilter.isToolAllowed('Bash(rm *)')) {
    blockedActions.push({ action: 'delete files', permission: 'Delete Files' });
  }
  
  if ((userMessage.includes('run') || userMessage.includes('execute') || userMessage.includes('command')) && 
      !userMessage.includes('delete') && !userMessage.includes('remove') &&
      !toolsFilter.isToolAllowed('Bash')) {
    blockedActions.push({ action: 'run commands', permission: 'Run Commands' });
  }
  
  // If blocked actions detected, return permission alert immediately
  if (blockedActions.length > 0) {
    const permissionData = {
      type: 'permission_required',
      missingPermissions: blockedActions.map(a => a.permission),
      actions: blockedActions.map(a => a.action),
      message: `Cannot ${blockedActions.map(a => a.action).join(', ')}. Please enable the required permissions in Settings.`
    };
    console.log('🚫 Blocking request due to missing permissions:', permissionData);
    sendToClient(clientId, 'permission_alert', permissionData, sessionId);
    return;
  }
  
  const claudePath = '/home/freddan11/projects/ClaudxGUI/claude-secure-wrapper.sh';
  
  // 🔒 CRITICAL FIX: Don't use --print mode for interactive sessions
  // --print mode bypasses Claude's interactive permission system
  const claudeArgs = [
    '--verbose',
    '--model', 'sonnet'
    // REMOVED: '--print' and '--output-format' - These bypass interactive permissions
    // REMOVED: '--dangerously-skip-permissions' - This was causing the security vulnerability!
  ];
  
  // ✅ Apply tool permissions from settings
  console.log('🔧 Applying tool permissions from settings');
  
  // Apply allowed tools from settings
  if (toolsSettings.allowedTools && toolsSettings.allowedTools.length > 0) {
    for (const tool of toolsSettings.allowedTools) {
      claudeArgs.push('--allowedTools', tool);
      console.log('✅ Allowing tool:', tool);
    }
  }
  
  // Apply disallowed tools from settings 
  if (toolsSettings.disallowedTools && toolsSettings.disallowedTools.length > 0) {
    for (const tool of toolsSettings.disallowedTools) {
      // Don't disallow a tool that's explicitly allowed
      if (!toolsSettings.allowedTools.includes(tool)) {
        claudeArgs.push('--disallowedTools', tool);
        console.log('❌ Blocking tool:', tool);
      } else {
        console.log('🔄 Skipping disallow for explicitly allowed tool:', tool);
      }
    }
  }
  
  // Skip permissions only if explicitly configured
  if (toolsSettings.skipPermissions) {
    claudeArgs.push('--dangerously-skip-permissions');
    console.log('⚠️  WARNING: Skipping all permissions - dangerous mode enabled');
  } else {
    console.log('✅ Tool permissions controlled by allowed/disallowed lists');
  }
  
  // Copy images to project directory for Claude to access
  let tempImagePaths: string[] = [];
  if (imagePaths.length > 0) {
    for (const imagePath of imagePaths) {
      try {
        const imageBuffer = fs.readFileSync(imagePath);
        const fileName = path.basename(imagePath);
        const tempPath = path.join(projectPath, fileName);
        fs.writeFileSync(tempPath, imageBuffer);
        tempImagePaths.push(tempPath);
        console.log('Copied image to project directory:', tempPath);
      } catch (error) {
        console.error('Error copying image:', error);
      }
    }
  }
  
  // Add the text content with image references and mentioned files if any
  let finalContent = cleanContent || 'Analyze the provided image(s)';
  
  if (tempImagePaths.length > 0) {
    finalContent = `${finalContent}\n\nPlease analyze these images:\n${tempImagePaths.map(p => `- ${path.basename(p)}`).join('\n')}`;
  }
  
  // Add mentioned files to the prompt
  if (mentionedFiles && mentionedFiles.length > 0) {
    const validFiles = mentionedFiles.filter(fileName => {
      const filePath = path.join(projectPath, fileName);
      return fs.existsSync(filePath);
    });
    
    if (validFiles.length > 0) {
      finalContent = `${finalContent}\n\nReferenced files:\n${validFiles.map(f => `\`${f}\``).join('\n')}`;
      
      // Send reading notifications for each referenced file
      validFiles.forEach(filePath => {
        const relativePath = path.relative(projectPath, filePath);
        const cleanPath = relativePath.startsWith('../') ? filePath : relativePath;
        const readingMessage = `Reading: ${cleanPath}`;
        
        console.log('🔍 SERVER: Creating reading notification for referenced file:', readingMessage);
        sendToClient(clientId, 'claude_tool_use', readingMessage, sessionId);
      });
    }
  }
  
  // Ensure we have content to send to Claude
  if (!finalContent || finalContent.trim() === '') {
    finalContent = 'Hello, please help me with this task.';
  }
  
  // Don't add content to args - we'll send it via stdin instead
  // claudeArgs.push(finalContent);
  
  console.log('Spawning Claude process with args:', JSON.stringify(claudeArgs, null, 2));
  console.log('Final content being sent to Claude:', finalContent.substring(0, 100) + '...');
  console.log('Working directory:', projectPath);
  console.log('Total args count:', claudeArgs.length);
  
  // Filesystem protection is now disabled - using Claude's built-in tool filtering
  // console.log('🔒 Activating filesystem protection for session:', sessionId);
  
  // Send thinking indicator
  sendToClient(clientId, 'claude_thinking', 'Claude is thinking...', sessionId);
  
  // Send security status to client
  sendToClient(clientId, 'security_status', {
    protection_active: true,
    project_path: projectPath,
    message: '✅ Permission-based security active - Tools filtered by settings'
  }, sessionId);
  
  const claudeProcess = spawn(claudePath, claudeArgs, {
    cwd: projectPath,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { 
      ...process.env,
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin'
    },
    detached: false,
    shell: false
  });
  
  // Send content via stdin for interactive Claude session
  if (claudeProcess.stdin) {
    console.log('Sending content to Claude via stdin...');
    claudeProcess.stdin.write(finalContent + '\n');
    // Don't end stdin - keep it open for interactive communication
  } else {
    console.error('Failed to get stdin for Claude process');
  }
  
  // Track the active process
  activeProcesses.set(sessionId, {
    process: claudeProcess,
    sessionId,
    clientId,
    startTime: Date.now(),
    projectPath,
    referencedFiles: mentionedFiles?.map(f => path.join(projectPath, f)) || []
  });
  
  let response = '';
  let errorOutput = '';
  let processCompleted = false;
  
  // Store tool uses by ID for later reference
  const toolUsesMap = new Map<string, any>();
  
  // Helper function to find tool use by ID
  const findToolUseById = (toolUseId: string, currentParsed: any): any => {
    // First check the stored tool uses map
    if (toolUsesMap.has(toolUseId)) {
      return toolUsesMap.get(toolUseId);
    }
    
    // Look for tool uses in the current parsed message
    if (currentParsed?.message?.content) {
      const toolUses = currentParsed.message.content.filter((item: any) => item.type === 'tool_use');
      const found = toolUses.find((toolUse: any) => toolUse.id === toolUseId);
      if (found) return found;
    }
    
    return null;
  };
  
  claudeProcess.stdout.on('data', async (data) => {
    const chunk = data.toString();
    const processInfo = activeProcesses.get(sessionId);
    const elapsed = processInfo ? Date.now() - processInfo.startTime : 0;
    console.log('🔍 SERVER: Claude stdout chunk:', chunk.length, 'bytes after', Math.round(elapsed / 1000), 'seconds');
    
    // Check if this chunk contains tool_use references
    if (chunk.includes('tool_use') || chunk.includes('"Read"') || chunk.includes('"name": "Read"')) {
      console.log('🔍 SERVER: TOOL USAGE DETECTED IN CHUNK:', chunk);
    }
    
    // Permission prompts are disabled - Claude should not ask for permissions with current configuration
    // Tools are pre-authorized through --allowedTools and --disallowedTools flags
    
    // Try to parse as JSON stream first
    const lines = chunk.split('\n').filter(line => line.trim());
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        console.log('🔍 SERVER: Parsed JSON type:', parsed.type, 'at', Math.round(elapsed / 1000), 'seconds');
        if (parsed.type === 'assistant') {
          console.log('🔍 SERVER: Assistant message content:', JSON.stringify(parsed.message?.content?.slice(0, 2), null, 2));
        }
        
        // Handle different types of JSON messages
        if (parsed.type === 'assistant' && parsed.message && parsed.message.content) {
          // Check for tool usage
          const toolUses = parsed.message.content.filter(item => item.type === 'tool_use');
          const textContent = parsed.message.content
            .filter(item => item.type === 'text')
            .map(item => item.text)
            .join('');
          
          console.log('🔍 SERVER: Found', toolUses.length, 'tool uses');
          if (toolUses.length > 0) {
            console.log('🔍 SERVER: Tool uses:', toolUses.map(t => `${t.name}(${JSON.stringify(t.input)})`));
            
            // Check if any Write/Edit tools are being attempted
            const writeTools = toolUses.filter(t => t.name === 'Write');
            const editTools = toolUses.filter(t => ['Edit', 'MultiEdit'].includes(t.name));
            
            if (writeTools.length > 0) {
              console.log('🔍 SERVER: WRITE TOOLS DETECTED:', writeTools);
            }
            if (editTools.length > 0) {
              console.log('🔍 SERVER: EDIT TOOLS DETECTED:', editTools);
            }
          }
          
          if (toolUses.length > 0) {
            // Process each tool use
            for (const toolUse of toolUses) {
              // Store tool use for later reference
              if (toolUse.id) {
                toolUsesMap.set(toolUse.id, toolUse);
              }
              
              let toolMessage = `Using ${toolUse.name}`;
              
              // Helper function to format paths
              const formatToolPath = (filePath: string, projectPath: string) => {
                if (!filePath) return '';
                
                // Convert to relative path if absolute
                if (path.isAbsolute(filePath)) {
                  try {
                    const relativePath = path.relative(projectPath, filePath);
                    // If the relative path doesn't go up directories, use it
                    if (!relativePath.startsWith('..')) {
                      return relativePath;
                    }
                  } catch (error) {
                    console.error('Error creating relative path:', error);
                  }
                }
                
                // Fallback: clean up the path by removing common prefixes
                let cleanPath = filePath;
                if (cleanPath.includes('/projects/')) {
                  const projectsIndex = cleanPath.indexOf('/projects/');
                  cleanPath = cleanPath.substring(projectsIndex + '/projects/'.length);
                  // Remove project name if it exists
                  const pathParts = cleanPath.split('/');
                  if (pathParts.length > 1) {
                    cleanPath = pathParts.slice(1).join('/');
                  }
                }
                
                return cleanPath;
              };

              // Create descriptive message based on tool and input
              const activeProcess = activeProcesses.get(sessionId);
              const currentProjectPath = activeProcess?.projectPath || projectPath;
              
              if (toolUse.name === 'Write') {
                const cleanPath = formatToolPath(toolUse.input.file_path, currentProjectPath);
                toolMessage = `Creating: ${cleanPath}`;
                console.log('🔍 SERVER: Created Write tool message:', toolMessage);
              } else if (toolUse.name === 'Read') {
                const cleanPath = formatToolPath(toolUse.input.file_path, currentProjectPath);
                toolMessage = `Reading: ${cleanPath}`;
                console.log('🔍 SERVER: Created Read tool message:', toolMessage);
              } else if (toolUse.name === 'Edit') {
                const cleanPath = formatToolPath(toolUse.input.file_path, currentProjectPath);
                toolMessage = `Editing: ${cleanPath}`;
              } else if (toolUse.name === 'MultiEdit') {
                const cleanPath = formatToolPath(toolUse.input.file_path, currentProjectPath);
                toolMessage = `Editing: ${cleanPath}`;
              } else if (toolUse.name === 'Bash') {
                // Truncate long commands
                const command = toolUse.input.command;
                const truncatedCommand = command.length > 60 ? `${command.substring(0, 57)}...` : command;
                toolMessage = `Running: ${truncatedCommand}`;
              } else if (toolUse.name === 'LS') {
                const cleanPath = formatToolPath(toolUse.input.path || '.', currentProjectPath);
                toolMessage = `Listing: ${cleanPath || '.'}`;
              } else if (toolUse.name === 'Grep') {
                toolMessage = `Searching: ${toolUse.input.pattern}`;
              } else if (toolUse.name === 'Glob') {
                toolMessage = `Finding: ${toolUse.input.pattern}`;
              } else if (toolUse.name === 'TodoWrite') {
                const todoCount = toolUse.input.todos?.length || 0;
                toolMessage = `Updating todo list (${todoCount} items)`;
              } else if (toolUse.name === 'TodoRead') {
                toolMessage = `Reading todo list`;
              } else if (toolUse.name === 'Task') {
                const description = toolUse.input.description;
                const truncatedDesc = description.length > 40 ? `${description.substring(0, 37)}...` : description;
                toolMessage = `Starting task: ${truncatedDesc}`;
              } else {
                toolMessage = `Using ${toolUse.name}`;
              }
              
              // Send enhanced tool message with structured data
              const operationData = {
                id: toolUse.id,
                type: toolUse.name.toLowerCase(),
                action: toolMessage,
                file: toolUse.input?.file_path ? formatToolPath(toolUse.input.file_path, currentProjectPath) : 
                      toolUse.input?.command || toolUse.input?.pattern || 'N/A',
                status: 'in_progress',
                timestamp: Date.now(),
                details: toolUse.input?.command || toolUse.input?.description || undefined
              };
              
              console.log('🔍 SERVER: Sending claude_tool_use message:', toolMessage);
              sendToClient(clientId, 'claude_tool_use', toolMessage, sessionId);
              sendToClient(clientId, 'claude_operation', operationData, sessionId);
              
              // Tool execution monitoring - permissions are now pre-checked via Claude arguments
              console.log(`✅ Tool ${toolUse.name} executed with settings-based permissions`);
              
              // Capture file state before Write/Edit operations
              if ((toolUse.name === 'Write' || toolUse.name === 'Edit' || toolUse.name === 'MultiEdit') && toolUse.input.file_path) {
                try {
                  // Convert absolute path to relative path for diff capture
                  const activeProcess = activeProcesses.get(sessionId);
                  if (activeProcess?.projectPath) {
                    diffCapture.setProjectPath(activeProcess.projectPath);
                    let relativePath = toolUse.input.file_path;
                    if (path.isAbsolute(relativePath)) {
                      relativePath = path.relative(activeProcess.projectPath, relativePath);
                    }
                    diffCapture.captureBeforeState(relativePath);
                  }
                } catch (error) {
                  console.error('Error capturing before state:', error);
                }
              }
            }
          }
          
          // Send text content as thinking AND accumulate for final response
          if (textContent.trim()) {
            // Send thinking text immediately as Claude processes
            sendToClient(clientId, 'claude_thinking_text', textContent, sessionId);
            // Also accumulate for final complete response
            response += textContent;
          }
        } else if (toolUses.length === 0 && textContent.trim()) {
          // This is final response text without tool usage - accumulate it
          console.log('Final response text (no tools):', textContent.substring(0, 100));
          response += textContent;
        } else if (parsed.type === 'user' && parsed.message && parsed.message.content) {
          // Tool results
          const toolResults = parsed.message.content.filter(item => item.type === 'tool_result');
          if (toolResults.length > 0) {
            for (const toolResult of toolResults) {
              // Don't send tool results to client - they're just for Claude's context
              console.log('Tool result received:', toolResult.content.substring(0, 100));
              
              // Send operation completion
              const completionData = {
                id: toolResult.tool_use_id,
                status: toolResult.is_error ? 'failed' : 'completed',
                timestamp: Date.now(),
                result: toolResult.content
              };
              sendToClient(clientId, 'claude_operation_complete', completionData, sessionId);
              
              // Generate diff for file operations
              if (toolResult.tool_use_id) {
                try {
                  // Find the corresponding tool use to get the file path
                  const correspondingToolUse = findToolUseById(toolResult.tool_use_id, parsed);
                  if (correspondingToolUse && 
                      (correspondingToolUse.name === 'Write' || correspondingToolUse.name === 'Edit' || correspondingToolUse.name === 'MultiEdit') &&
                      correspondingToolUse.input.file_path) {
                    
                    const activeProcess = activeProcesses.get(sessionId);
                    if (activeProcess?.projectPath) {
                      diffCapture.setProjectPath(activeProcess.projectPath);
                      let relativePath = correspondingToolUse.input.file_path;
                      if (path.isAbsolute(relativePath)) {
                        relativePath = path.relative(activeProcess.projectPath, relativePath);
                      }
                      
                      // Generate diff after operation
                      const diffData = diffCapture.generateDiff(relativePath);
                      if (diffData) {
                        sendToClient(clientId, 'file_diff', diffData, sessionId);
                      }
                    }
                  }
                } catch (error) {
                  console.error('Error generating diff:', error);
                }
              }
            }
          }
        } else if (parsed.type === 'result' && parsed.result) {
          // Final result - only use if we don't have response from assistant
          if (!response) {
            response = parsed.result;
          }
        }
      } catch (e) {
        // If not JSON, treat as raw text (normal Claude output)
        console.log('Claude text output at', Math.round(elapsed / 1000), 'seconds:', line);
        
        // Store the response but don't send immediately - wait for process to complete
        // to avoid duplicate responses
        response += line;
      }
    }
  });
  
  claudeProcess.stderr.on('data', (data) => {
    const processInfo = activeProcesses.get(sessionId);
    const elapsed = processInfo ? Date.now() - processInfo.startTime : 0;
    console.log('Claude stderr chunk at', Math.round(elapsed / 1000), 'seconds:', data.toString());
    errorOutput += data.toString();
  });
  
  claudeProcess.on('spawn', () => {
    console.log('Claude process spawned successfully for session:', sessionId);
    // Close stdin to signal end of input
    claudeProcess.stdin?.end();
    
    // Keep process alive with periodic checks
    const keepAlive = setInterval(() => {
      if (activeProcesses.has(sessionId) && !processCompleted) {
        const elapsed = Date.now() - (activeProcesses.get(sessionId)?.startTime || 0);
        console.log('Process', sessionId, 'still alive after', Math.round(elapsed / 1000), 'seconds');
      } else {
        clearInterval(keepAlive);
      }
    }, 30000); // Log every 30 seconds
  });
  
  claudeProcess.on('close', (code) => {
    processCompleted = true;
    const processInfo = activeProcesses.get(sessionId);
    const elapsed = processInfo ? Date.now() - processInfo.startTime : 0;
    activeProcesses.delete(sessionId);
    
    // 🚨 Check for security violations
    const securityViolationFile = '/tmp/claude-security-violation.flag';
    if (fs.existsSync(securityViolationFile)) {
      try {
        const violationData = fs.readFileSync(securityViolationFile, 'utf8');
        console.log('🚨 SECURITY VIOLATION DETECTED:', violationData);
        
        // Parse violation data: SECURITY_VIOLATION:file:event:timestamp
        const [, filePath, event, timestamp] = violationData.split(':');
        
        sendToClient(clientId, 'security_violation', {
          type: 'filesystem_violation',
          filePath: filePath,
          operation: event,
          timestamp: timestamp,
          message: `🚨 SECURITY VIOLATION: Claude was terminated for unauthorized ${event} operation on ${filePath}`,
          action: 'claude_terminated'
        }, sessionId);
        
        // Clean up the flag file
        fs.unlinkSync(securityViolationFile);
        
        console.log('🛑 Claude process was terminated due to security violation');
      } catch (error) {
        console.error('Error reading security violation file:', error);
      }
    }
    
    // Send security status to client
    sendToClient(clientId, 'security_status', {
      protection_active: false,
      project_path: projectPath,
      message: '✅ Session ended - Tool permissions remain active'
    }, sessionId);
    
    // Clean up temporary images
    if (tempImagePaths.length > 0) {
      for (const tempPath of tempImagePaths) {
        try {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
            console.log('Cleaned up temporary image:', tempPath);
          }
        } catch (error) {
          console.error('Error cleaning up temporary image:', error);
        }
      }
    }
    
    console.log('Claude process finished with code:', code, 'after', Math.round(elapsed / 1000), 'seconds');
    console.log('Response length:', response.length);
    console.log('Error output length:', errorOutput.length);
    console.log('Response content:', JSON.stringify(response.substring(0, 200)));
    console.log('Error content:', JSON.stringify(errorOutput));
    
    if (code === 0 && response.trim()) {
      console.log('Sending response to client:', clientId);
      
      // Send completion notifications for any pending reading operations
      const activeProcess = activeProcesses.get(sessionId);
      if (activeProcess?.referencedFiles) {
        activeProcess.referencedFiles.forEach((filePath: string) => {
          const relativePath = path.relative(activeProcess.projectPath, filePath);
          const cleanPath = relativePath.startsWith('../') ? filePath : relativePath;
          sendToClient(clientId, 'claude_tool_result', {
            tool_use_id: `read-${Date.now()}`,
            content: `Reading completed: ${cleanPath}`,
            is_error: false
          }, sessionId);
        });
      }
      
      sendToClient(clientId, 'claude_response', response.trim(), sessionId);
    } else if (code === 143) {
      console.log('Process was terminated (SIGTERM) - likely timeout or abort');
      sendToClient(clientId, 'claude_error', `Claude process was terminated after ${Math.round(elapsed / 1000)} seconds`, sessionId);
    } else if (errorOutput.trim()) {
      console.log('Sending error to client:', clientId);
      sendToClient(clientId, 'claude_error', `Claude error: ${errorOutput.trim()}`, sessionId);
    } else {
      console.log('Sending code error to client:', clientId);
      
      // Check if this is likely a permission issue
      if (code === 0 && !response.trim() && !errorOutput.trim()) {
        // Claude exited successfully but produced no output - likely missing permissions
        const currentSettings = toolsFilter.getSettings();
        const blockedTools = ['Write', 'Edit', 'MultiEdit', 'Bash'].filter(tool => 
          !currentSettings.allowedTools.includes(tool) || currentSettings.disallowedTools.includes(tool)
        );
        
        if (blockedTools.length > 0) {
          // Try to determine what action was requested
          const userMessage = finalContent || '';
          let actionHint = '';
          
          if (userMessage.toLowerCase().includes('create') || userMessage.toLowerCase().includes('write') || userMessage.toLowerCase().includes('add')) {
            actionHint = ' To create files, enable "Write" permission.';
          } else if (userMessage.toLowerCase().includes('edit') || userMessage.toLowerCase().includes('modify') || userMessage.toLowerCase().includes('update')) {
            actionHint = ' To edit files, enable "Edit" permission.';
          } else if (userMessage.toLowerCase().includes('run') || userMessage.toLowerCase().includes('execute') || userMessage.toLowerCase().includes('command')) {
            actionHint = ' To run commands, enable "Bash" permission.';
          }
          
          sendToClient(clientId, 'claude_error', 
            `❌ Missing permission: Claude cannot access [${blockedTools.join(', ')}] tools.${actionHint} Please enable these in Settings → Permissions.`, 
            sessionId);
        } else {
          sendToClient(clientId, 'claude_error', `Claude completed successfully but produced no output. This might indicate missing permissions or an unsupported operation.`, sessionId);
        }
      } else {
        sendToClient(clientId, 'claude_error', `Claude exited with code ${code} after ${Math.round(elapsed / 1000)} seconds`, sessionId);
      }
    }
  });
  
  claudeProcess.on('error', (error) => {
    processCompleted = true;
    const processInfo = activeProcesses.get(sessionId);
    const elapsed = processInfo ? Date.now() - processInfo.startTime : 0;
    activeProcesses.delete(sessionId);
    
    // Clean up temporary images
    if (tempImagePaths.length > 0) {
      for (const tempPath of tempImagePaths) {
        try {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
            console.log('Cleaned up temporary image:', tempPath);
          }
        } catch (error) {
          console.error('Error cleaning up temporary image:', error);
        }
      }
    }
    
    console.error('Error running Claude CLI after', Math.round(elapsed / 1000), 'seconds:', error);
    sendToClient(clientId, 'claude_error', `Failed to run Claude: ${error.message}`, sessionId);
  });
}

// Add endpoint to get active sessions
app.get('/api/sessions', (_req, res) => {
  const sessions = Array.from(activeProcesses.entries()).map(([sessionId, processInfo]) => ({
    sessionId,
    clientId: processInfo.clientId,
    startTime: processInfo.startTime,
    projectPath: processInfo.projectPath,
    duration: Date.now() - processInfo.startTime
  }));
  res.json({ sessions });
});

// Add endpoint to abort a session
app.post('/api/sessions/:sessionId/abort', (req, res) => {
  const { sessionId } = req.params;
  const processInfo = activeProcesses.get(sessionId);
  if (processInfo) {
    abortSession(sessionId);
    res.json({ message: 'Session aborted successfully' });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// Initialize database and start server
async function startServer() {
  try {
    console.log('Initializing database...');
    await db.waitForInitialization();
    console.log('Database initialized successfully');
    
    // Create image directories
    console.log('Creating image directories...');
    if (!fs.existsSync(IMAGES_DIR)) {
      fs.mkdirSync(IMAGES_DIR, { recursive: true });
      console.log('Created images directory:', IMAGES_DIR);
    }
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
      console.log('Created temp directory:', TEMP_DIR);
    }
    
    server.listen(port, () => {
      console.log(`Server listening on http://localhost:${port}`);
      console.log(`WebSocket endpoints: /ws, /chat`);
      console.log(`Session timeout: ${SESSION_TIMEOUT / 1000 / 60} minutes`);
      console.log(`Cleanup interval: ${CLEANUP_INTERVAL / 1000 / 60} minutes`);
    });
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

startServer(); 