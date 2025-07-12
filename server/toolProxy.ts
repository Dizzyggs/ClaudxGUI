/**
 * Tool Proxy - Intercepts and controls tool execution with permission system
 * 
 * This module provides a secure wrapper around Claude's tool execution
 * that requires explicit user permission for dangerous operations.
 */

import { spawn, SpawnOptionsWithoutStdio } from 'child_process';
import { PermissionManager } from './permissionManager.js';

interface ToolExecutionContext {
  clientId: string;
  sessionId: string;
  projectPath: string;
  sendToClient: (clientId: string, type: string, data: any, sessionId: string) => void;
}

export class ToolProxy {
  private permissionManager: PermissionManager;
  private originalClaudePath: string;
  private context: ToolExecutionContext;

  constructor(
    permissionManager: PermissionManager, 
    claudePath: string,
    context: ToolExecutionContext
  ) {
    this.permissionManager = permissionManager;
    this.originalClaudePath = claudePath;
    this.context = context;
  }

  /**
   * Creates a secure Claude wrapper that intercepts dangerous tool operations
   */
  async createSecureClaudeWrapper(
    claudeArgs: string[],
    options: SpawnOptionsWithoutStdio
  ): Promise<any> {
    console.log('🔒 Starting secure Claude wrapper with permission system');
    
    // Create the Claude process
    const claudeProcess = spawn(this.originalClaudePath, claudeArgs, options);
    
    // Create a security proxy that intercepts stdin/stdout
    const secureProxy = this.createSecurityProxy(claudeProcess);
    
    return secureProxy;
  }

  /**
   * Creates a security proxy that intercepts and validates tool execution
   */
  private createSecurityProxy(claudeProcess: any): any {
    const { clientId, sessionId, sendToClient } = this.context;
    
    // Store original stdin write method
    const originalStdinWrite = claudeProcess.stdin?.write.bind(claudeProcess.stdin);
    
    // Create a buffer to capture tool execution requests
    let messageBuffer = '';
    
    // Override stdin to intercept tool execution
    if (claudeProcess.stdin) {
      claudeProcess.stdin.write = async (chunk: any, encoding?: any, callback?: any) => {
        const data = chunk.toString();
        console.log('🔍 Intercepting stdin data:', data.substring(0, 100));
        
        // Check for dangerous tool execution patterns
        if (await this.containsDangerousOperation(data)) {
          console.log('🚨 DANGEROUS OPERATION DETECTED - Requesting permission');
          
          // Extract tool information
          const toolInfo = this.extractToolInfo(data);
          
          if (toolInfo && this.permissionManager.requiresPermission(toolInfo)) {
            console.log(`🔒 Tool ${toolInfo.name} requires permission`);
            
            try {
              const permitted = await this.permissionManager.requestPermission(
                toolInfo,
                clientId,
                sessionId
              );
              
              if (!permitted) {
                console.log('❌ Permission denied - Blocking tool execution');
                
                // Send error response instead of executing tool
                const errorResponse = JSON.stringify({
                  type: 'tool_result',
                  tool_use_id: toolInfo.id,
                  content: '🚨 PERMISSION DENIED: User rejected this operation. Tool execution blocked for security.',
                  is_error: true
                });
                
                // Send error to Claude's stdout (simulate tool failure)
                claudeProcess.emit('data', Buffer.from(errorResponse + '\n'));
                
                // Call callback if provided
                if (callback) callback();
                return true;
              }
              
              console.log('✅ Permission granted - Allowing tool execution');
            } catch (error) {
              console.error('🚨 Permission check failed:', error);
              
              // Block execution on permission error
              const errorResponse = JSON.stringify({
                type: 'tool_result',
                tool_use_id: toolInfo.id,
                content: `🚨 PERMISSION ERROR: ${error.message}. Tool execution blocked for security.`,
                is_error: true
              });
              
              claudeProcess.emit('data', Buffer.from(errorResponse + '\n'));
              if (callback) callback();
              return true;
            }
          }
        }
        
        // If we reach here, the operation is safe or permitted
        console.log('✅ Operation approved - Forwarding to Claude');
        return originalStdinWrite(chunk, encoding, callback);
      };
    }
    
    return claudeProcess;
  }

  /**
   * Checks if the data contains dangerous operations
   */
  private async containsDangerousOperation(data: string): Promise<boolean> {
    const dangerousPatterns = [
      /rm\s+/,
      /del\s+/,
      /delete\s+/,
      /unlink\s+/,
      /erase\s+/,
      /format\s+/,
      /dd\s+/,
      /"name":\s*"(Write|Edit|MultiEdit|Delete|Remove|Bash)"/,
      /sudo\s+/,
      /chmod\s+/,
      /chown\s+/
    ];
    
    return dangerousPatterns.some(pattern => pattern.test(data));
  }

  /**
   * Extracts tool information from the data
   */
  private extractToolInfo(data: string): any {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(data);
      
      if (parsed.type === 'tool_use') {
        return {
          id: parsed.tool_use_id || parsed.id,
          name: parsed.name,
          input: parsed.input || parsed.parameters
        };
      }
      
      // Look for tool_use patterns in the data
      const toolUseMatch = data.match(/"type":\s*"tool_use".*?"name":\s*"([^"]+)".*?"input":\s*({[^}]+})/);
      if (toolUseMatch) {
        return {
          id: 'extracted',
          name: toolUseMatch[1],
          input: JSON.parse(toolUseMatch[2])
        };
      }
    } catch (error) {
      console.error('Error extracting tool info:', error);
    }
    
    return null;
  }

  /**
   * Validates tool execution safety
   */
  private validateToolSafety(toolInfo: any): boolean {
    if (!toolInfo) return true;
    
    // Check for dangerous tools
    const dangerousTools = ['Write', 'Edit', 'MultiEdit', 'Delete', 'Remove', 'Bash'];
    if (dangerousTools.includes(toolInfo.name)) {
      console.log(`⚠️  Dangerous tool detected: ${toolInfo.name}`);
      return false;
    }
    
    // Check for dangerous commands in Bash
    if (toolInfo.name === 'Bash' && toolInfo.input?.command) {
      const cmd = toolInfo.input.command.toLowerCase();
      const dangerousCommands = ['rm ', 'del ', 'delete ', 'unlink', 'erase', 'format', 'dd ', 'sudo '];
      
      if (dangerousCommands.some(dangerous => cmd.includes(dangerous))) {
        console.log(`⚠️  Dangerous command detected: ${toolInfo.input.command}`);
        return false;
      }
    }
    
    return true;
  }
}

export default ToolProxy;