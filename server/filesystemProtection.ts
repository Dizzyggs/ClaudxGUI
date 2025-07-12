/**
 * Filesystem Protection Layer - Emergency Security Fix
 * 
 * This module provides a last-resort protection layer that prevents
 * unauthorized file operations at the filesystem level.
 */

import fs from 'fs';
import path from 'path';
import { PermissionManager } from './permissionManager.js';

interface ProtectionContext {
  clientId: string;
  sessionId: string;
  permissionManager: PermissionManager;
  sendToClient: (clientId: string, type: string, data: any, sessionId: string) => void;
}

export class FilesystemProtection {
  private context: ProtectionContext;
  private protectedPaths: Set<string> = new Set();
  private originalMethods: Map<string, Function> = new Map();
  private protectionActive: boolean = false;

  constructor(context: ProtectionContext) {
    this.context = context;
  }

  /**
   * Checks if a specific operation type is allowed based on current permissions
   */
  private isOperationAllowed(operationType: 'Write' | 'Edit' | 'Delete'): boolean {
    // This would need to be connected to the ToolsFilter to check current permissions
    // For now, we'll default to requiring explicit permission for all operations
    return false; // Always require permission - safer default
  }

  /**
   * Activates filesystem protection by intercepting dangerous operations
   */
  activateProtection(projectPath: string): void {
    if (this.protectionActive) {
      console.log('🔒 Filesystem protection already active');
      return;
    }

    console.log('🔒 Activating filesystem protection layer');
    
    // Store original methods - BOTH sync and async versions
    this.originalMethods.set('writeFileSync', fs.writeFileSync);
    this.originalMethods.set('writeFile', fs.writeFile);
    this.originalMethods.set('unlinkSync', fs.unlinkSync);
    this.originalMethods.set('unlink', fs.unlink);
    this.originalMethods.set('rmSync', fs.rmSync);
    this.originalMethods.set('rm', fs.rm);
    this.originalMethods.set('rmdirSync', fs.rmdirSync);
    this.originalMethods.set('rmdir', fs.rmdir);
    
    // Override dangerous filesystem operations - BOTH sync and async
    this.overrideWriteFileSync(projectPath);
    this.overrideWriteFile(projectPath);  // Add async version
    this.overrideUnlinkSync(projectPath);
    this.overrideUnlink(projectPath);     // Add async version
    this.overrideRmSync(projectPath);
    this.overrideRm(projectPath);         // Add async version
    this.overrideRmdirSync(projectPath);
    this.overrideRmdir(projectPath);      // Add async version
    
    this.protectionActive = true;
    console.log('✅ Filesystem protection activated');
  }

  /**
   * Deactivates filesystem protection
   */
  deactivateProtection(): void {
    if (!this.protectionActive) {
      return;
    }

    console.log('🔓 Deactivating filesystem protection');
    
    // Restore original methods - BOTH sync and async
    (fs as any).writeFileSync = this.originalMethods.get('writeFileSync');
    (fs as any).writeFile = this.originalMethods.get('writeFile');
    (fs as any).unlinkSync = this.originalMethods.get('unlinkSync');
    (fs as any).unlink = this.originalMethods.get('unlink');
    (fs as any).rmSync = this.originalMethods.get('rmSync');
    (fs as any).rm = this.originalMethods.get('rm');
    (fs as any).rmdirSync = this.originalMethods.get('rmdirSync');
    (fs as any).rmdir = this.originalMethods.get('rmdir');
    
    this.protectionActive = false;
    console.log('✅ Filesystem protection deactivated');
  }

  /**
   * Overrides fs.writeFileSync to require permission
   */
  private overrideWriteFileSync(projectPath: string): void {
    const originalWriteFileSync = this.originalMethods.get('writeFileSync') as typeof fs.writeFileSync;
    
    (fs as any).writeFileSync = (file: any, data: any, options?: any) => {
      const filePath = typeof file === 'string' ? file : file.toString();
      const absolutePath = path.resolve(filePath);
      
      console.log(`🔒 Intercepted writeFileSync: ${absolutePath}`);
      
      // Check if this is within our project
      if (absolutePath.startsWith(projectPath)) {
        console.log(`🔍 File write in project directory, checking permission...`);
        
        // 🚨 EMERGENCY SECURITY FIX: Block dangerous operations immediately
        console.log(`❌ BLOCKED: Unauthorized file write attempt: ${absolutePath}`);
        
        this.context.sendToClient(this.context.clientId, 'security_alert', {
          type: 'write_blocked',
          filePath: absolutePath,
          message: '🚨 BLOCKED: Unauthorized file write operation detected and blocked'
        }, this.context.sessionId);
        
        // Create a permission request for the user to manually approve
        setTimeout(() => {
          this.context.permissionManager.requestPermission(
            {
              name: 'Write',
              input: { file_path: absolutePath },
              id: `write-protection-${Date.now()}`
            },
            this.context.clientId,
            this.context.sessionId
          ).then(permitted => {
            if (permitted) {
              console.log(`✅ Permission granted retrospectively for: ${absolutePath}`);
              this.context.sendToClient(this.context.clientId, 'security_alert', {
                type: 'permission_granted',
                filePath: absolutePath,
                message: '✅ Permission granted - You can retry the operation'
              }, this.context.sessionId);
            }
          }).catch(error => {
            console.error('Permission request failed:', error);
          });
        }, 100);
        
        throw new Error(`🚨 SECURITY VIOLATION: Unauthorized file write blocked - ${absolutePath}`);
      }
      
      // Call original method if permission granted or outside project
      return originalWriteFileSync.call(fs, file, data, options);
    };
  }

  /**
   * Overrides fs.unlinkSync to require permission
   */
  private overrideUnlinkSync(projectPath: string): void {
    const originalUnlinkSync = this.originalMethods.get('unlinkSync') as typeof fs.unlinkSync;
    
    (fs as any).unlinkSync = (filePath: any) => {
      const absolutePath = path.resolve(filePath.toString());
      
      console.log(`🔒 Intercepted unlinkSync: ${absolutePath}`);
      
      // Check if this is within our project
      if (absolutePath.startsWith(projectPath)) {
        console.log(`🔍 File deletion in project directory, checking permission...`);
        
        // 🚨 CRITICAL SECURITY FIX: Block file deletion immediately
        console.log(`❌ BLOCKED: Unauthorized file deletion attempt: ${absolutePath}`);
        
        this.context.sendToClient(this.context.clientId, 'security_alert', {
          type: 'delete_blocked',
          filePath: absolutePath,
          message: '🚨 BLOCKED: Unauthorized file deletion detected and blocked'
        }, this.context.sessionId);
        
        // Create a permission request for the user to manually approve
        setTimeout(() => {
          this.context.permissionManager.requestPermission(
            {
              name: 'Delete',
              input: { file_path: absolutePath },
              id: `delete-protection-${Date.now()}`
            },
            this.context.clientId,
            this.context.sessionId
          ).then(permitted => {
            if (permitted) {
              console.log(`✅ Permission granted retrospectively for deletion: ${absolutePath}`);
              this.context.sendToClient(this.context.clientId, 'security_alert', {
                type: 'permission_granted',
                filePath: absolutePath,
                message: '✅ Permission granted - You can retry the deletion'
              }, this.context.sessionId);
            }
          }).catch(error => {
            console.error('Permission request failed:', error);
          });
        }, 100);
        
        throw new Error(`🚨 SECURITY VIOLATION: Unauthorized file deletion blocked - ${absolutePath}`);
      }
      
      // Call original method if permission granted or outside project
      return originalUnlinkSync.call(fs, filePath);
    };
  }

  /**
   * Overrides fs.rmSync to require permission
   */
  private overrideRmSync(projectPath: string): void {
    const originalRmSync = this.originalMethods.get('rmSync') as typeof fs.rmSync;
    
    (fs as any).rmSync = (filePath: any, options?: any) => {
      const absolutePath = path.resolve(filePath.toString());
      
      console.log(`🔒 Intercepted rmSync: ${absolutePath}`);
      
      // Check if this is within our project
      if (absolutePath.startsWith(projectPath)) {
        console.log(`🔍 File/directory removal in project directory, checking permission...`);
        
        // 🚨 CRITICAL SECURITY FIX: Block rmSync immediately
        console.log(`❌ BLOCKED: Unauthorized rmSync attempt: ${absolutePath}`);
        
        this.context.sendToClient(this.context.clientId, 'security_alert', {
          type: 'delete_blocked',
          filePath: absolutePath,
          message: '🚨 BLOCKED: Unauthorized rm operation detected and blocked'
        }, this.context.sessionId);
        
        throw new Error(`🚨 SECURITY VIOLATION: Unauthorized rm operation blocked - ${absolutePath}`);
      }
      
      // Call original method if permission granted or outside project
      return originalRmSync.call(fs, filePath, options);
    };
  }

  /**
   * Overrides fs.rmdirSync to require permission
   */
  private overrideRmdirSync(projectPath: string): void {
    const originalRmdirSync = this.originalMethods.get('rmdirSync') as typeof fs.rmdirSync;
    
    (fs as any).rmdirSync = (dirPath: any, options?: any) => {
      const absolutePath = path.resolve(dirPath.toString());
      
      console.log(`🔒 Intercepted rmdirSync: ${absolutePath}`);
      
      // Check if this is within our project
      if (absolutePath.startsWith(projectPath)) {
        console.log(`🔍 Directory removal in project directory, checking permission...`);
        
        // 🚨 CRITICAL SECURITY FIX: Block rmdirSync immediately
        console.log(`❌ BLOCKED: Unauthorized rmdirSync attempt: ${absolutePath}`);
        
        this.context.sendToClient(this.context.clientId, 'security_alert', {
          type: 'delete_blocked',
          filePath: absolutePath,
          message: '🚨 BLOCKED: Unauthorized directory removal detected and blocked'
        }, this.context.sessionId);
        
        throw new Error(`🚨 SECURITY VIOLATION: Unauthorized directory removal blocked - ${absolutePath}`);
      }
      
      // Call original method if permission granted or outside project
      return originalRmdirSync.call(fs, dirPath, options);
    };
  }

  /**
   * Overrides fs.writeFile (async) to require permission
   */
  private overrideWriteFile(projectPath: string): void {
    const originalWriteFile = this.originalMethods.get('writeFile') as typeof fs.writeFile;
    
    (fs as any).writeFile = (file: any, data: any, options: any, callback?: any) => {
      // Handle both writeFile(file, data, callback) and writeFile(file, data, options, callback)
      const cb = typeof options === 'function' ? options : callback;
      const opts = typeof options === 'function' ? undefined : options;
      
      const absolutePath = path.resolve(file.toString());
      console.log(`🔒 Intercepted async writeFile: ${absolutePath}`);
      
      // Check if this is within our project
      if (absolutePath.startsWith(projectPath)) {
        console.log(`🔍 Async file write in project directory, checking permission...`);
        
        // 🚨 CRITICAL SECURITY FIX: Block async file write immediately
        console.log(`❌ BLOCKED: Unauthorized async file write attempt: ${absolutePath}`);
        
        this.context.sendToClient(this.context.clientId, 'security_alert', {
          type: 'write_blocked',
          filePath: absolutePath,
          message: '🚨 BLOCKED: Unauthorized async file write operation detected and blocked'
        }, this.context.sessionId);
        
        if (cb) {
          // Return error via callback
          cb(new Error(`🚨 SECURITY VIOLATION: Unauthorized async file write blocked - ${absolutePath}`));
          return;
        }
      }
      
      // Call original method if permission granted or outside project
      if (opts) {
        return originalWriteFile.call(fs, file, data, opts, cb);
      } else {
        return originalWriteFile.call(fs, file, data, cb);
      }
    };
  }

  /**
   * Overrides fs.unlink (async) to require permission
   */
  private overrideUnlink(projectPath: string): void {
    const originalUnlink = this.originalMethods.get('unlink') as typeof fs.unlink;
    
    (fs as any).unlink = (filePath: any, callback: any) => {
      const absolutePath = path.resolve(filePath.toString());
      console.log(`🔒 Intercepted async unlink: ${absolutePath}`);
      
      // Check if this is within our project
      if (absolutePath.startsWith(projectPath)) {
        console.log(`🔍 Async file deletion in project directory, checking permission...`);
        
        // 🚨 CRITICAL SECURITY FIX: Block async file deletion immediately
        console.log(`❌ BLOCKED: Unauthorized async file deletion attempt: ${absolutePath}`);
        
        this.context.sendToClient(this.context.clientId, 'security_alert', {
          type: 'delete_blocked',
          filePath: absolutePath,
          message: '🚨 BLOCKED: Unauthorized async file deletion detected and blocked'
        }, this.context.sessionId);
        
        // Return error via callback
        callback(new Error(`🚨 SECURITY VIOLATION: Unauthorized async file deletion blocked - ${absolutePath}`));
        return;
      }
      
      // Call original method if permission granted or outside project
      return originalUnlink.call(fs, filePath, callback);
    };
  }

  /**
   * Overrides fs.rm (async) to require permission
   */
  private overrideRm(projectPath: string): void {
    const originalRm = this.originalMethods.get('rm') as typeof fs.rm;
    
    (fs as any).rm = (filePath: any, options: any, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      const opts = typeof options === 'function' ? undefined : options;
      
      const absolutePath = path.resolve(filePath.toString());
      console.log(`🔒 Intercepted async rm: ${absolutePath}`);
      
      // Check if this is within our project
      if (absolutePath.startsWith(projectPath)) {
        console.log(`🔍 Async file/directory removal in project directory, checking permission...`);
        
        // 🚨 CRITICAL SECURITY FIX: Block async rm immediately
        console.log(`❌ BLOCKED: Unauthorized async rm attempt: ${absolutePath}`);
        
        this.context.sendToClient(this.context.clientId, 'security_alert', {
          type: 'delete_blocked',
          filePath: absolutePath,
          message: '🚨 BLOCKED: Unauthorized async file/directory removal detected and blocked'
        }, this.context.sessionId);
        
        // Return error via callback
        if (cb) {
          cb(new Error(`🚨 SECURITY VIOLATION: Unauthorized async rm blocked - ${absolutePath}`));
          return;
        }
      }
      
      // Call original method if permission granted or outside project
      if (opts) {
        return originalRm.call(fs, filePath, opts, cb);
      } else {
        return originalRm.call(fs, filePath, cb);
      }
    };
  }

  /**
   * Overrides fs.rmdir (async) to require permission
   */
  private overrideRmdir(projectPath: string): void {
    const originalRmdir = this.originalMethods.get('rmdir') as typeof fs.rmdir;
    
    (fs as any).rmdir = (dirPath: any, options: any, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      const opts = typeof options === 'function' ? undefined : options;
      
      const absolutePath = path.resolve(dirPath.toString());
      console.log(`🔒 Intercepted async rmdir: ${absolutePath}`);
      
      // Check if this is within our project
      if (absolutePath.startsWith(projectPath)) {
        console.log(`🔍 Async directory removal in project directory, checking permission...`);
        
        // 🚨 CRITICAL SECURITY FIX: Block async rmdir immediately
        console.log(`❌ BLOCKED: Unauthorized async rmdir attempt: ${absolutePath}`);
        
        this.context.sendToClient(this.context.clientId, 'security_alert', {
          type: 'delete_blocked',
          filePath: absolutePath,
          message: '🚨 BLOCKED: Unauthorized async directory removal detected and blocked'
        }, this.context.sessionId);
        
        // Return error via callback
        if (cb) {
          cb(new Error(`🚨 SECURITY VIOLATION: Unauthorized async rmdir blocked - ${absolutePath}`));
          return;
        }
      }
      
      // Call original method if permission granted or outside project
      if (opts) {
        return originalRmdir.call(fs, dirPath, opts, cb);
      } else {
        return originalRmdir.call(fs, dirPath, cb);
      }
    };
  }

  /**
   * Adds a path to the protected list
   */
  addProtectedPath(filePath: string): void {
    this.protectedPaths.add(path.resolve(filePath));
    console.log(`🔒 Added to protected paths: ${filePath}`);
  }

  /**
   * Removes a path from the protected list
   */
  removeProtectedPath(filePath: string): void {
    this.protectedPaths.delete(path.resolve(filePath));
    console.log(`🔓 Removed from protected paths: ${filePath}`);
  }

  /**
   * Checks if a path is protected
   */
  isPathProtected(filePath: string): boolean {
    const absolutePath = path.resolve(filePath);
    return this.protectedPaths.has(absolutePath);
  }

  /**
   * Gets protection status
   */
  getProtectionStatus(): {
    active: boolean;
    protectedPaths: string[];
    interceptedMethods: string[];
  } {
    return {
      active: this.protectionActive,
      protectedPaths: Array.from(this.protectedPaths),
      interceptedMethods: Array.from(this.originalMethods.keys())
    };
  }
}

export default FilesystemProtection;