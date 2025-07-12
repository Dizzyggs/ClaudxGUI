/**
 * Tools Filter - Pre-execution tool permission system
 * Based on the approach used in claudecodeui
 */

interface ToolsSettings {
  allowedTools: string[];
  disallowedTools: string[];
  skipPermissions: boolean;
}

export class ToolsFilter {
  private settings: ToolsSettings;

  constructor(settings: ToolsSettings) {
    this.settings = settings;
  }

  /**
   * Checks if a tool is allowed to execute
   */
  isToolAllowed(toolName: string, input?: any): boolean {
    console.log(`🔍 Checking if tool ${toolName} is allowed`);
    console.log(`📋 Current settings:`, this.settings);
    
    // If skip permissions is enabled, allow all tools
    if (this.settings.skipPermissions) {
      console.log(`✅ Tool ${toolName} allowed (skip permissions enabled)`);
      return true;
    }

    // Check allowed tools first - if explicitly allowed, override any disallow
    if (this.isToolExplicitlyAllowed(toolName, input)) {
      console.log(`✅ Tool ${toolName} is explicitly allowed`);
      return true;
    }

    // Check disallowed tools
    if (this.isToolDisallowed(toolName, input)) {
      console.log(`❌ Tool ${toolName} is explicitly disallowed`);
      return false;
    }

    // Default: disallow dangerous tools, allow safe ones
    const safeTool = this.isSafeTool(toolName);
    console.log(`${safeTool ? '✅' : '❌'} Tool ${toolName} is ${safeTool ? 'safe' : 'dangerous'} by default`);
    return safeTool;
  }

  /**
   * Checks if a tool is explicitly disallowed
   */
  private isToolDisallowed(toolName: string, input?: any): boolean {
    return this.settings.disallowedTools.some(pattern => {
      return this.matchesPattern(toolName, pattern, input);
    });
  }

  /**
   * Checks if a tool is explicitly allowed
   */
  private isToolExplicitlyAllowed(toolName: string, input?: any): boolean {
    return this.settings.allowedTools.some(pattern => {
      return this.matchesPattern(toolName, pattern, input);
    });
  }

  /**
   * Checks if a tool is safe by default
   */
  private isSafeTool(toolName: string): boolean {
    const safeTools = [
      'Read',
      'LS',
      'Grep',
      'Glob',
      'TodoRead',
      'TodoWrite',
      'Task',
      'WebFetch',
      'WebSearch'
    ];
    
    return safeTools.includes(toolName);
  }

  /**
   * Checks if a tool matches a pattern
   */
  private matchesPattern(toolName: string, pattern: string, input?: any): boolean {
    // Exact match
    if (pattern === toolName) {
      return true;
    }

    // Wildcard pattern (e.g., "Bash*", "*")
    if (pattern.includes('*')) {
      const regexPattern = pattern.replace(/\*/g, '.*');
      return new RegExp(`^${regexPattern}$`).test(toolName);
    }

    // Command-specific pattern (e.g., "Bash(git log:*)")
    if (pattern.includes('(') && pattern.includes(')')) {
      const match = pattern.match(/^(\w+)\((.+)\)$/);
      if (match) {
        const [, patternTool, commandPattern] = match;
        if (patternTool === toolName && input?.command) {
          const cmdRegex = commandPattern.replace(/\*/g, '.*');
          return new RegExp(`^${cmdRegex}`).test(input.command);
        }
      }
    }

    return false;
  }

  /**
   * Gets the default settings for development
   */
  static getDefaultSettings(): ToolsSettings {
    return {
      allowedTools: [
        'Read',
        'LS',
        'Grep',
        'Glob',
        'TodoRead',
        'TodoWrite',
        'Task',
        'WebFetch',
        'WebSearch'
      ],
      disallowedTools: [
        'Write',
        'Edit',
        'MultiEdit',
        'Delete',
        'Remove',
        'Bash',
        'Bash(rm *)',
        'Bash(del *)',
        'Bash(delete *)',
        'Bash(unlink *)',
        'Bash(erase *)'
      ],
      skipPermissions: false
    };
  }

  /**
   * Gets the settings for plan mode (restricted)
   */
  static getPlanModeSettings(): ToolsSettings {
    return {
      allowedTools: [
        'Read',
        'Task',
        'TodoRead',
        'TodoWrite',
        'LS',
        'Grep',
        'Glob'
      ],
      disallowedTools: [
        'Write',
        'Edit',
        'MultiEdit',
        'Delete',
        'Remove',
        'Bash',
        'WebFetch',
        'WebSearch'
      ],
      skipPermissions: false
    };
  }

  /**
   * Updates the settings
   */
  updateSettings(newSettings: Partial<ToolsSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    console.log('🔧 Tools filter settings updated:', this.settings);
  }

  /**
   * Gets current settings
   */
  getSettings(): ToolsSettings {
    return { ...this.settings };
  }
}

export default ToolsFilter;