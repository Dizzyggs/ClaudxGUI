import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export interface ShellProfile {
  id: string;
  name: string;
  path: string;
  args: string[];
  type: 'wsl' | 'powershell' | 'cmd' | 'bash' | 'zsh' | 'fish';
  distro?: string; // For WSL
  isAvailable: boolean;
  isDefault?: boolean;
}

export interface PlatformInfo {
  platform: 'win32' | 'darwin' | 'linux';
  isWSL: boolean;
  wslDistros: string[];
  availableShells: ShellProfile[];
  defaultShell: string;
}

class ShellManager {
  private cachedShells: ShellProfile[] = [];
  private platformInfo: PlatformInfo | null = null;

  async detectPlatform(): Promise<PlatformInfo> {
    if (this.platformInfo) {
      return this.platformInfo;
    }

    const platform = os.platform() as 'win32' | 'darwin' | 'linux';
    let isWSL = false;
    let wslDistros: string[] = [];

    // Check if we're running inside WSL
    if (platform === 'linux') {
      try {
        const release = await fs.promises.readFile('/proc/version', 'utf8');
        isWSL = release.toLowerCase().includes('microsoft') || release.toLowerCase().includes('wsl');
      } catch (error) {
        // Not WSL
      }
    }

    // Detect WSL distros if on Windows
    if (platform === 'win32') {
      try {
        const { stdout } = await execAsync('wsl.exe --list --quiet');
        wslDistros = stdout
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map(line => line.replace(/\0/g, '')); // Remove null characters
      } catch (error) {
        console.log('WSL not available or no distros installed');
      }
    }

    const availableShells = await this.detectShells(platform, wslDistros);
    const defaultShell = this.getDefaultShell(availableShells);

    this.platformInfo = {
      platform,
      isWSL,
      wslDistros,
      availableShells,
      defaultShell
    };

    return this.platformInfo;
  }

  private async detectShells(platform: string, wslDistros: string[]): Promise<ShellProfile[]> {
    const shells: ShellProfile[] = [];

    if (platform === 'win32') {
      // Windows shells
      await this.detectWindowsShells(shells);
      
      // WSL shells
      for (const distro of wslDistros) {
        await this.detectWSLShells(shells, distro);
      }
    } else if (platform === 'darwin') {
      // macOS shells
      await this.detectUnixShells(shells);
    } else {
      // Linux shells
      await this.detectUnixShells(shells);
    }

    this.cachedShells = shells;
    return shells;
  }

  private async detectWindowsShells(shells: ShellProfile[]): Promise<void> {
    // PowerShell 7+
    const pwsh7Paths = [
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe'
    ];

    for (const pwshPath of pwsh7Paths) {
      if (await this.checkFileExists(pwshPath)) {
        shells.push({
          id: 'pwsh7',
          name: 'PowerShell 7',
          path: pwshPath,
          args: ['-NoLogo'],
          type: 'powershell',
          isAvailable: true,
          isDefault: true // Prefer PowerShell 7 on Windows
        });
        break;
      }
    }

    // Windows PowerShell 5.1
    const powershellPath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    if (await this.checkFileExists(powershellPath)) {
      shells.push({
        id: 'powershell',
        name: 'Windows PowerShell',
        path: powershellPath,
        args: ['-NoLogo'],
        type: 'powershell',
        isAvailable: true,
        isDefault: shells.length === 0 // Default if no PowerShell 7
      });
    }

    // Command Prompt
    const cmdPath = 'C:\\Windows\\System32\\cmd.exe';
    if (await this.checkFileExists(cmdPath)) {
      shells.push({
        id: 'cmd',
        name: 'Command Prompt',
        path: cmdPath,
        args: [],
        type: 'cmd',
        isAvailable: true
      });
    }

    // Git Bash (if installed)
    const gitBashPaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
    ];

    for (const gitBashPath of gitBashPaths) {
      if (await this.checkFileExists(gitBashPath)) {
        shells.push({
          id: 'gitbash',
          name: 'Git Bash',
          path: gitBashPath,
          args: ['--login'],
          type: 'bash',
          isAvailable: true
        });
        break;
      }
    }
  }

  private async detectWSLShells(shells: ShellProfile[], distro: string): Promise<void> {
    try {
      // Test if the distro is running and accessible
      const { stdout } = await execAsync(`wsl.exe -d ${distro} echo "test"`);
      if (stdout.includes('test')) {
        shells.push({
          id: `wsl-${distro.toLowerCase()}`,
          name: `WSL - ${distro}`,
          path: 'wsl.exe',
          args: ['-d', distro],
          type: 'wsl',
          distro: distro,
          isAvailable: true,
          isDefault: shells.filter(s => s.isDefault).length === 0 // First WSL becomes default if no PowerShell 7
        });
      }
    } catch (error) {
      console.log(`WSL distro ${distro} not accessible:`, error);
    }
  }

  private async detectUnixShells(shells: ShellProfile[]): Promise<void> {
    const userShell = process.env.SHELL || '/bin/bash';
    const shellName = path.basename(userShell);

    // User's default shell
    if (await this.checkFileExists(userShell)) {
      shells.push({
        id: `${shellName}-default`,
        name: `${shellName.charAt(0).toUpperCase() + shellName.slice(1)} (Default)`,
        path: userShell,
        args: [],
        type: shellName as 'bash' | 'zsh' | 'fish',
        isAvailable: true,
        isDefault: true
      });
    }

    // Common shells
    const commonShells = [
      { path: '/bin/bash', name: 'Bash', type: 'bash' as const },
      { path: '/usr/bin/bash', name: 'Bash', type: 'bash' as const },
      { path: '/bin/zsh', name: 'Zsh', type: 'zsh' as const },
      { path: '/usr/bin/zsh', name: 'Zsh', type: 'zsh' as const },
      { path: '/usr/bin/fish', name: 'Fish', type: 'fish' as const },
      { path: '/bin/sh', name: 'Sh', type: 'bash' as const }
    ];

    for (const shell of commonShells) {
      if (await this.checkFileExists(shell.path) && !shells.find(s => s.path === shell.path)) {
        shells.push({
          id: shell.path.replace(/\//g, '-').replace(/^-/, ''),
          name: shell.name,
          path: shell.path,
          args: [],
          type: shell.type,
          isAvailable: true
        });
      }
    }
  }

  private async checkFileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private getDefaultShell(shells: ShellProfile[]): string {
    const defaultShell = shells.find(shell => shell.isDefault);
    return defaultShell?.id || shells[0]?.id || 'bash';
  }

  async getAvailableShells(): Promise<ShellProfile[]> {
    if (this.cachedShells.length === 0) {
      await this.detectPlatform();
    }
    return this.cachedShells;
  }

  async getShellById(id: string): Promise<ShellProfile | null> {
    const shells = await this.getAvailableShells();
    return shells.find(shell => shell.id === id) || null;
  }

  async refreshShells(): Promise<ShellProfile[]> {
    this.cachedShells = [];
    this.platformInfo = null;
    return this.getAvailableShells();
  }

  // WSL-specific utilities
  convertToWSLPath(windowsPath: string): string {
    // Convert Windows path to WSL path: C:\Users\name -> /mnt/c/Users/name
    if (!windowsPath.match(/^[A-Za-z]:\\/)) {
      return windowsPath; // Already a Unix path
    }
    
    const drive = windowsPath.charAt(0).toLowerCase();
    const restPath = windowsPath.slice(3).replace(/\\/g, '/');
    return `/mnt/${drive}/${restPath}`;
  }

  convertToWindowsPath(wslPath: string): string {
    // Convert WSL path to Windows path: /mnt/c/Users/name -> C:\Users\name
    const wslMatch = wslPath.match(/^\/mnt\/([a-z])\/(.*)/);
    if (wslMatch) {
      const drive = wslMatch[1].toUpperCase();
      const restPath = wslMatch[2].replace(/\//g, '\\');
      return `${drive}:\\${restPath}`;
    }
    return wslPath; // Not a WSL mount path
  }

  isWSLPath(path: string): boolean {
    return path.startsWith('/mnt/');
  }

  isWindowsPath(path: string): boolean {
    return /^[A-Za-z]:\\/.test(path);
  }
}

export const shellManager = new ShellManager();