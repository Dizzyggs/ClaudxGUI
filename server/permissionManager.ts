interface PermissionRequest {
  id: string;
  type: 'file_write' | 'file_edit' | 'file_delete' | 'bash_command' | 'network' | 'system';
  action: string;
  command?: string;
  reason?: string;
  filePath?: string;
  riskLevel: 'low' | 'medium' | 'high';
  toolUse: any;
  resolve: (allowed: boolean) => void;
  reject: (error: Error) => void;
}

interface SessionPermissions {
  [permissionType: string]: boolean;
}

class PermissionManager {
  private pendingRequests = new Map<string, PermissionRequest>();
  private sessionPermissions = new Map<string, SessionPermissions>();
  private sendToClient: (clientId: string, type: string, data: any, sessionId?: string) => void;

  constructor(sendToClient: (clientId: string, type: string, data: any, sessionId?: string) => void) {
    this.sendToClient = sendToClient;
  }

  /**
   * Check if a tool usage requires permission
   */
  requiresPermission(toolUse: any): boolean {
    const dangerousTools = ['Write', 'Edit', 'MultiEdit', 'Bash', 'Delete', 'Remove'];
    const highRiskCommands = ['rm', 'sudo', 'chmod', 'chown', 'dd', 'format', 'del', 'erase', 'unlink'];
    
    console.log(`🔍 Checking permission for tool: ${toolUse.name}, command: ${toolUse.input?.command || 'N/A'}`);
    
    if (dangerousTools.includes(toolUse.name)) {
      console.log(`⚠️ Tool ${toolUse.name} is in dangerous tools list - REQUIRES PERMISSION`);
      return true;
    }

    // Check for high-risk bash commands (including file deletion)
    if (toolUse.name === 'Bash' && toolUse.input.command) {
      const command = toolUse.input.command.toLowerCase();
      const isHighRisk = highRiskCommands.some(risk => command.includes(risk));
      if (isHighRisk) {
        console.log(`⚠️ Bash command "${command}" contains high-risk operation - REQUIRES PERMISSION`);
        return true;
      }
    }

    // Check for file operations that look like deletion
    if (toolUse.input?.file_path && toolUse.input?.operation === 'delete') {
      console.log(`⚠️ File deletion operation detected - REQUIRES PERMISSION`);
      return true;
    }

    console.log(`✅ Tool ${toolUse.name} does not require permission`);
    return false;
  }

  /**
   * Get permission type from tool use
   */
  getPermissionType(toolUse: any): string {
    switch (toolUse.name) {
      case 'Write':
        return 'file_write';
      case 'Edit':
      case 'MultiEdit':
        return 'file_edit';
      case 'Bash':
        return 'bash_command';
      default:
        return 'system';
    }
  }

  /**
   * Assess risk level of operation
   */
  getRiskLevel(toolUse: any): 'low' | 'medium' | 'high' {
    if (toolUse.name === 'Bash') {
      const command = toolUse.input.command?.toLowerCase() || '';
      const highRiskCommands = ['rm', 'sudo', 'chmod', 'chown', 'dd', 'format', 'mv', 'cp'];
      const mediumRiskCommands = ['git', 'npm', 'yarn', 'pip', 'curl', 'wget'];
      
      if (highRiskCommands.some(risk => command.includes(risk))) {
        return 'high';
      }
      if (mediumRiskCommands.some(risk => command.includes(risk))) {
        return 'medium';
      }
      return 'low';
    }

    if (toolUse.name === 'Write') {
      // Check if writing to sensitive locations
      const filePath = toolUse.input.file_path?.toLowerCase() || '';
      if (filePath.includes('config') || filePath.includes('.env') || filePath.includes('package.json')) {
        return 'medium';
      }
      return 'low';
    }

    return 'low';
  }

  /**
   * Generate human-readable reason for permission request
   */
  generateReason(toolUse: any): string {
    switch (toolUse.name) {
      case 'Write':
        return `Create a new file: ${toolUse.input.file_path}`;
      case 'Edit':
      case 'MultiEdit':
        return `Modify the file: ${toolUse.input.file_path}`;
      case 'Bash':
        const command = toolUse.input.command;
        if (command.includes('npm install')) {
          return 'Install Node.js packages';
        }
        if (command.includes('git')) {
          return 'Run Git commands to manage version control';
        }
        return `Execute terminal command: ${command}`;
      default:
        return `Perform ${toolUse.name} operation`;
    }
  }

  /**
   * Check if permission is already granted for this session
   */
  isSessionPermissionGranted(sessionId: string, permissionType: string): boolean {
    const sessionPerms = this.sessionPermissions.get(sessionId);
    return sessionPerms?.[permissionType] === true;
  }

  /**
   * Request permission for a tool use
   */
  async requestPermission(
    toolUse: any, 
    clientId: string, 
    sessionId: string
  ): Promise<boolean> {
    const permissionType = this.getPermissionType(toolUse);
    
    // Check if already approved for this session
    if (this.isSessionPermissionGranted(sessionId, permissionType)) {
      console.log(`Permission auto-approved for ${permissionType} in session ${sessionId}`);
      return true;
    }

    const permissionId = `perm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const riskLevel = this.getRiskLevel(toolUse);
    
    const permissionRequest: PermissionRequest = {
      id: permissionId,
      type: permissionType as any,
      action: this.generateReason(toolUse),
      command: toolUse.name === 'Bash' ? toolUse.input.command : undefined,
      reason: this.generateReason(toolUse),
      filePath: toolUse.input.file_path,
      riskLevel,
      toolUse,
      resolve: () => {},
      reject: () => {}
    };

    // Create promise that will be resolved when user responds
    const permissionPromise = new Promise<boolean>((resolve, reject) => {
      permissionRequest.resolve = resolve;
      permissionRequest.reject = reject;
      
      // Set timeout for permission request (60 seconds) - longer timeout for manual review
      setTimeout(() => {
        if (this.pendingRequests.has(permissionId)) {
          console.log(`⏰ Permission request ${permissionId} timed out - DENYING automatically`);
          this.pendingRequests.delete(permissionId);
          reject(new Error('Permission request timed out - access denied for security'));
        }
      }, 60000);
    });

    // Store the pending request
    this.pendingRequests.set(permissionId, permissionRequest);

    // Send permission request to client
    const requestData = {
      id: permissionId,
      type: permissionRequest.type,
      action: permissionRequest.action,
      command: permissionRequest.command,
      reason: permissionRequest.reason,
      filePath: permissionRequest.filePath,
      riskLevel: permissionRequest.riskLevel
    };

    console.log(`Requesting permission for ${permissionType}:`, requestData);
    this.sendToClient(clientId, 'permission_request', requestData, sessionId);

    return permissionPromise;
  }

  /**
   * Handle permission response from client
   */
  handlePermissionResponse(
    permissionId: string, 
    response: 'allow_once' | 'allow_session' | 'deny_suggest_alt',
    sessionId: string
  ): void {
    const request = this.pendingRequests.get(permissionId);
    if (!request) {
      console.warn(`No pending permission request found for ID: ${permissionId}`);
      return;
    }

    console.log(`Permission response for ${request.type}: ${response}`);

    if (response === 'allow_once' || response === 'allow_session') {
      // Grant permission
      if (response === 'allow_session') {
        // Remember for this session
        if (!this.sessionPermissions.has(sessionId)) {
          this.sessionPermissions.set(sessionId, {});
        }
        const sessionPerms = this.sessionPermissions.get(sessionId)!;
        sessionPerms[request.type] = true;
        console.log(`Session permission granted for ${request.type} in session ${sessionId}`);
      }
      
      request.resolve(true);
    } else {
      // Deny permission
      request.resolve(false);
    }

    // Clean up
    this.pendingRequests.delete(permissionId);
  }

  /**
   * Clear session permissions (when session ends)
   */
  clearSessionPermissions(sessionId: string): void {
    this.sessionPermissions.delete(sessionId);
    console.log(`Cleared session permissions for session: ${sessionId}`);
  }

  /**
   * Get pending requests count (for debugging)
   */
  getPendingRequestsCount(): number {
    return this.pendingRequests.size;
  }
}

export { PermissionManager, PermissionRequest };