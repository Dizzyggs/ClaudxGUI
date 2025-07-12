/**
 * Secure Tool Wrapper - Emergency Security Fix
 * 
 * This module provides a secure wrapper around dangerous tools to prevent
 * unauthorized operations from being executed.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { PermissionManager } from './permissionManager.js';

interface SecurityContext {
  clientId: string;
  sessionId: string;
  permissionManager: PermissionManager;
  sendToClient: (clientId: string, type: string, data: any, sessionId: string) => void;
}

export class SecureToolWrapper {
  private context: SecurityContext;
  private blockedOperations: Set<string> = new Set();

  constructor(context: SecurityContext) {
    this.context = context;
  }

  /**
   * Creates a secure environment for Claude execution
   */
  createSecureEnvironment(projectPath: string): any {
    const { clientId, sessionId, permissionManager, sendToClient } = this.context;
    
    // Create secure wrappers for dangerous operations
    const secureEnv = {
      // Secure file operations
      writeFile: this.createSecureFileWriter(projectPath),
      deleteFile: this.createSecureFileDeleter(projectPath),
      executeCommand: this.createSecureCommandExecutor(projectPath),
      
      // Permission helpers
      checkPermission: async (operation: string, details: any) => {
        console.log(`🔒 Checking permission for ${operation}:`, details);
        
        const toolUse = {
          name: operation,
          input: details,
          id: `secure-${Date.now()}`
        };
        
        if (permissionManager.requiresPermission(toolUse)) {
          try {
            const permitted = await permissionManager.requestPermission(
              toolUse,
              clientId,
              sessionId
            );
            
            if (!permitted) {
              console.log(`❌ Permission denied for ${operation}`);
              this.blockedOperations.add(toolUse.id);
              
              sendToClient(clientId, 'security_alert', {
                type: 'permission_denied',
                operation,
                details,
                message: `🚨 BLOCKED: ${operation} operation denied by user`
              }, sessionId);
              
              return false;
            }
            
            console.log(`✅ Permission granted for ${operation}`);
            return true;
          } catch (error) {
            console.error(`🚨 Permission check failed for ${operation}:`, error);
            this.blockedOperations.add(toolUse.id);
            
            sendToClient(clientId, 'security_alert', {
              type: 'permission_error',
              operation,
              details,
              message: `🚨 BLOCKED: ${operation} operation blocked due to permission error`
            }, sessionId);
            
            return false;
          }
        }
        
        return true; // Safe operations don't need permission
      }
    };
    
    return secureEnv;
  }

  /**
   * Creates a secure file writer that requires permission
   */
  private createSecureFileWriter(projectPath: string) {
    return async (filePath: string, content: string, options: any = {}) => {
      const absolutePath = path.resolve(projectPath, filePath);
      
      console.log(`🔒 Secure file write requested: ${absolutePath}`);
      
      // Check permission first
      const permitted = await this.context.permissionManager.requestPermission(
        {
          name: 'Write',
          input: { file_path: absolutePath, content },
          id: `write-${Date.now()}`
        },
        this.context.clientId,
        this.context.sessionId
      );
      
      if (!permitted) {
        console.log(`❌ File write blocked: ${absolutePath}`);
        this.context.sendToClient(this.context.clientId, 'security_alert', {
          type: 'write_blocked',
          filePath: absolutePath,
          message: '🚨 BLOCKED: File write operation denied by user'
        }, this.context.sessionId);
        
        throw new Error('Permission denied: File write operation blocked');
      }
      
      console.log(`✅ File write permitted: ${absolutePath}`);
      
      // Ensure directory exists
      const dir = path.dirname(absolutePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Write the file
      fs.writeFileSync(absolutePath, content, options);
      
      this.context.sendToClient(this.context.clientId, 'security_alert', {
        type: 'write_success',
        filePath: absolutePath,
        message: `✅ File written successfully: ${path.basename(absolutePath)}`
      }, this.context.sessionId);
      
      return { success: true, path: absolutePath };
    };
  }

  /**
   * Creates a secure file deleter that requires permission
   */
  private createSecureFileDeleter(projectPath: string) {
    return async (filePath: string) => {
      const absolutePath = path.resolve(projectPath, filePath);
      
      console.log(`🔒 Secure file delete requested: ${absolutePath}`);
      
      // Check if file exists first
      if (!fs.existsSync(absolutePath)) {
        console.log(`⚠️  File does not exist: ${absolutePath}`);
        return { success: false, error: 'File does not exist' };
      }
      
      // Check permission
      const permitted = await this.context.permissionManager.requestPermission(
        {
          name: 'Delete',
          input: { file_path: absolutePath },
          id: `delete-${Date.now()}`
        },
        this.context.clientId,
        this.context.sessionId
      );
      
      if (!permitted) {
        console.log(`❌ File delete BLOCKED: ${absolutePath}`);
        this.context.sendToClient(this.context.clientId, 'security_alert', {
          type: 'delete_blocked',
          filePath: absolutePath,
          message: '🚨 BLOCKED: File deletion denied by user'
        }, this.context.sessionId);
        
        throw new Error('Permission denied: File deletion blocked');
      }
      
      console.log(`✅ File delete permitted: ${absolutePath}`);
      
      // Delete the file
      fs.unlinkSync(absolutePath);
      
      this.context.sendToClient(this.context.clientId, 'security_alert', {
        type: 'delete_success',
        filePath: absolutePath,
        message: `✅ File deleted successfully: ${path.basename(absolutePath)}`
      }, this.context.sessionId);
      
      return { success: true, path: absolutePath };
    };
  }

  /**
   * Creates a secure command executor that requires permission
   */
  private createSecureCommandExecutor(projectPath: string) {
    return async (command: string, options: any = {}) => {
      console.log(`🔒 Secure command execution requested: ${command}`);
      
      // Check if command is dangerous
      const dangerousCommands = ['rm ', 'del ', 'delete ', 'unlink', 'erase', 'format', 'dd ', 'sudo '];
      const isDangerous = dangerousCommands.some(dangerous => command.toLowerCase().includes(dangerous));
      
      if (isDangerous) {
        console.log(`🚨 Dangerous command detected: ${command}`);
        
        // Require permission for dangerous commands
        const permitted = await this.context.permissionManager.requestPermission(
          {
            name: 'Bash',
            input: { command },
            id: `bash-${Date.now()}`
          },
          this.context.clientId,
          this.context.sessionId
        );
        
        if (!permitted) {
          console.log(`❌ Dangerous command BLOCKED: ${command}`);
          this.context.sendToClient(this.context.clientId, 'security_alert', {
            type: 'command_blocked',
            command,
            message: '🚨 BLOCKED: Dangerous command denied by user'
          }, this.context.sessionId);
          
          throw new Error('Permission denied: Dangerous command blocked');
        }
        
        console.log(`✅ Dangerous command permitted: ${command}`);
      }
      
      // Execute the command
      return new Promise((resolve, reject) => {
        const child = spawn(command, [], {
          cwd: projectPath,
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        child.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true, stdout, stderr, code });
          } else {
            reject({ success: false, stdout, stderr, code });
          }
        });
        
        child.on('error', (error) => {
          reject({ success: false, error: error.message });
        });
      });
    };
  }

  /**
   * Checks if an operation is currently blocked
   */
  isOperationBlocked(operationId: string): boolean {
    return this.blockedOperations.has(operationId);
  }

  /**
   * Clears blocked operations (for cleanup)
   */
  clearBlockedOperations(): void {
    this.blockedOperations.clear();
  }
}

export default SecureToolWrapper;