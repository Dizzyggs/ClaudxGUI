import { spawn, IPty } from 'node-pty';
import { v4 as uuidv4 } from 'uuid';
import { shellManager, ShellProfile } from './shellManager';
import * as path from 'path';
import * as os from 'os';

export interface TerminalSession {
  id: string;
  pty: IPty;
  shellProfile: ShellProfile;
  projectPath: string;
  clientId: string;
  createdAt: Date;
  isActive: boolean;
}

export interface TerminalCreateOptions {
  shellId?: string;
  projectPath?: string;
  clientId: string;
  cols?: number;
  rows?: number;
}

export interface TerminalResizeOptions {
  cols: number;
  rows: number;
}

class TerminalManager {
  private sessions = new Map<string, TerminalSession>();
  private cleanupInterval: NodeJS.Timer;

  constructor() {
    // Clean up abandoned sessions every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 5 * 60 * 1000);
  }

  async createSession(options: TerminalCreateOptions): Promise<TerminalSession> {
    const { shellId, projectPath, clientId, cols = 80, rows = 24 } = options;

    // Get shell profile
    const shells = await shellManager.getAvailableShells();
    let shellProfile: ShellProfile;

    if (shellId) {
      const requestedShell = await shellManager.getShellById(shellId);
      if (!requestedShell) {
        throw new Error(`Shell not found: ${shellId}`);
      }
      shellProfile = requestedShell;
    } else {
      // Use default shell
      const platform = await shellManager.detectPlatform();
      const defaultShell = await shellManager.getShellById(platform.defaultShell);
      if (!defaultShell) {
        throw new Error('No default shell available');
      }
      shellProfile = defaultShell;
    }

    // Determine working directory
    let cwd = projectPath || process.cwd();
    
    // Handle WSL path conversion
    if (shellProfile.type === 'wsl' && projectPath) {
      if (shellManager.isWindowsPath(projectPath)) {
        cwd = shellManager.convertToWSLPath(projectPath);
      }
    }

    // Create PTY process
    const pty = this.createPTY(shellProfile, cwd, cols, rows);
    
    const session: TerminalSession = {
      id: uuidv4(),
      pty,
      shellProfile,
      projectPath: projectPath || process.cwd(),
      clientId,
      createdAt: new Date(),
      isActive: true
    };

    this.sessions.set(session.id, session);
    
    console.log(`Created terminal session ${session.id} for client ${clientId} using shell ${shellProfile.name}`);
    
    return session;
  }

  private createPTY(shellProfile: ShellProfile, cwd: string, cols: number, rows: number): IPty {
    const env = { ...process.env };
    
    // Set terminal environment variables
    env.TERM = 'xterm-256color';
    env.COLORTERM = 'truecolor';
    
    // Platform-specific adjustments
    if (os.platform() === 'win32') {
      // Windows-specific environment
      env.TERM_PROGRAM = 'ClaudxGUI';
    } else {
      // Unix-specific environment
      env.SHELL = shellProfile.path;
    }

    try {
      const pty = spawn(shellProfile.path, shellProfile.args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env,
        // Windows-specific options
        ...(os.platform() === 'win32' && {
          useConpty: true, // Use ConPTY on Windows 10+
        })
      });

      return pty;
    } catch (error) {
      console.error(`Failed to create PTY for shell ${shellProfile.name}:`, error);
      throw new Error(`Failed to create terminal: ${error.message}`);
    }
  }

  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionsByClient(clientId: string): TerminalSession[] {
    return Array.from(this.sessions.values()).filter(
      session => session.clientId === clientId && session.isActive
    );
  }

  getAllActiveSessions(): TerminalSession[] {
    return Array.from(this.sessions.values()).filter(session => session.isActive);
  }

  writeToSession(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      return false;
    }

    try {
      session.pty.write(data);
      return true;
    } catch (error) {
      console.error(`Failed to write to terminal session ${sessionId}:`, error);
      this.destroySession(sessionId);
      return false;
    }
  }

  resizeSession(sessionId: string, options: TerminalResizeOptions): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      return false;
    }

    try {
      session.pty.resize(options.cols, options.rows);
      return true;
    } catch (error) {
      console.error(`Failed to resize terminal session ${sessionId}:`, error);
      return false;
    }
  }

  destroySession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      session.isActive = false;
      session.pty.kill();
      this.sessions.delete(sessionId);
      console.log(`Destroyed terminal session ${sessionId}`);
      return true;
    } catch (error) {
      console.error(`Failed to destroy terminal session ${sessionId}:`, error);
      return false;
    }
  }

  destroySessionsByClient(clientId: string): number {
    const clientSessions = this.getSessionsByClient(clientId);
    let destroyedCount = 0;

    for (const session of clientSessions) {
      if (this.destroySession(session.id)) {
        destroyedCount++;
      }
    }

    return destroyedCount;
  }

  private cleanupInactiveSessions(): void {
    const now = new Date();
    const inactiveSessions: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      // Clean up sessions older than 1 hour that are inactive
      const sessionAge = now.getTime() - session.createdAt.getTime();
      const oneHour = 60 * 60 * 1000;

      if (!session.isActive || sessionAge > oneHour) {
        inactiveSessions.push(sessionId);
      }
    }

    for (const sessionId of inactiveSessions) {
      this.destroySession(sessionId);
    }

    if (inactiveSessions.length > 0) {
      console.log(`Cleaned up ${inactiveSessions.length} inactive terminal sessions`);
    }
  }

  // Get terminal session info for debugging
  getSessionInfo(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      id: session.id,
      shellProfile: {
        id: session.shellProfile.id,
        name: session.shellProfile.name,
        type: session.shellProfile.type
      },
      projectPath: session.projectPath,
      clientId: session.clientId,
      createdAt: session.createdAt,
      isActive: session.isActive,
      processId: session.pty.pid
    };
  }

  // Get statistics
  getStats(): any {
    const activeSessions = this.getAllActiveSessions();
    const sessionsByShell = new Map<string, number>();
    
    for (const session of activeSessions) {
      const shellType = session.shellProfile.type;
      sessionsByShell.set(shellType, (sessionsByShell.get(shellType) || 0) + 1);
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions: activeSessions.length,
      sessionsByShell: Object.fromEntries(sessionsByShell)
    };
  }

  shutdown(): void {
    console.log('Shutting down terminal manager...');
    
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Destroy all sessions
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      this.destroySession(sessionId);
    }

    console.log('Terminal manager shutdown complete');
  }
}

export const terminalManager = new TerminalManager();

// Graceful shutdown
process.on('SIGINT', () => {
  terminalManager.shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  terminalManager.shutdown();
  process.exit(0);
});