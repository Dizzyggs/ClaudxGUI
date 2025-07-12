import fs from 'fs';
import path from 'path';

export interface FileChange {
  filePath: string;
  operation: 'create' | 'update' | 'delete';
  oldContent?: string;
  newContent?: string;
  timestamp: number;
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  lineNumber?: number;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffData {
  filePath: string;
  operation: 'create' | 'update' | 'delete';
  language: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
}

class DiffCapture {
  private fileStates = new Map<string, string>();
  private projectPath: string = '';

  setProjectPath(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Capture file state before operation
   */
  captureBeforeState(filePath: string): void {
    try {
      const fullPath = path.resolve(this.projectPath, filePath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        this.fileStates.set(filePath, content);
      } else {
        this.fileStates.set(filePath, ''); // File doesn't exist
      }
    } catch (error) {
      console.error('Error capturing before state:', error);
      this.fileStates.set(filePath, '');
    }
  }

  /**
   * Generate diff after operation
   */
  generateDiff(filePath: string): DiffData | null {
    try {
      const fullPath = path.resolve(this.projectPath, filePath);
      const oldContent = this.fileStates.get(filePath) || '';
      
      let newContent = '';
      let operation: 'create' | 'update' | 'delete' = 'update';
      
      if (fs.existsSync(fullPath)) {
        newContent = fs.readFileSync(fullPath, 'utf8');
        operation = oldContent === '' ? 'create' : 'update';
      } else {
        operation = 'delete';
      }

      // Skip if no actual changes
      if (operation === 'update' && oldContent === newContent) {
        return null;
      }

      const diff = this.createDiffData({
        filePath,
        operation,
        oldContent,
        newContent
      });

      // Clean up captured state
      this.fileStates.delete(filePath);

      return diff;
    } catch (error) {
      console.error('Error generating diff:', error);
      return null;
    }
  }

  /**
   * Create diff data from file change
   */
  private createDiffData(change: {
    filePath: string;
    operation: 'create' | 'update' | 'delete';
    oldContent: string;
    newContent: string;
  }): DiffData {
    const language = this.getLanguageFromPath(change.filePath);
    
    if (change.operation === 'create') {
      return this.generateCreateDiff(change, language);
    } else if (change.operation === 'delete') {
      return this.generateDeleteDiff(change, language);
    } else {
      return this.generateUpdateDiff(change, language);
    }
  }

  /**
   * Generate diff for file creation
   */
  private generateCreateDiff(change: any, language: string): DiffData {
    const lines = change.newContent.split('\n');
    const diffLines: DiffLine[] = lines.map((content: string, index: number) => ({
      type: 'add' as const,
      content,
      newLineNumber: index + 1
    }));

    return {
      filePath: change.filePath,
      operation: 'create',
      language,
      additions: lines.length,
      deletions: 0,
      lines: diffLines
    };
  }

  /**
   * Generate diff for file deletion
   */
  private generateDeleteDiff(change: any, language: string): DiffData {
    const lines = change.oldContent.split('\n');
    const diffLines: DiffLine[] = lines.map((content: string, index: number) => ({
      type: 'remove' as const,
      content,
      oldLineNumber: index + 1
    }));

    return {
      filePath: change.filePath,
      operation: 'delete',
      language,
      additions: 0,
      deletions: lines.length,
      lines: diffLines
    };
  }

  /**
   * Generate diff for file update
   */
  private generateUpdateDiff(change: any, language: string): DiffData {
    const oldLines = change.oldContent.split('\n');
    const newLines = change.newContent.split('\n');
    
    const diffLines = this.generateLineDiff(oldLines, newLines);
    
    const additions = diffLines.filter(line => line.type === 'add').length;
    const deletions = diffLines.filter(line => line.type === 'remove').length;

    return {
      filePath: change.filePath,
      operation: 'update',
      language,
      additions,
      deletions,
      lines: diffLines.slice(0, 100) // Limit for performance
    };
  }

  /**
   * Generate line-by-line diff
   */
  private generateLineDiff(oldLines: string[], newLines: string[]): DiffLine[] {
    const result: DiffLine[] = [];
    let oldIndex = 0;
    let newIndex = 0;
    
    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      const oldLine = oldLines[oldIndex];
      const newLine = newLines[newIndex];
      
      if (oldIndex >= oldLines.length) {
        // Remaining lines are additions
        result.push({
          type: 'add',
          content: newLine || '',
          newLineNumber: newIndex + 1
        });
        newIndex++;
      } else if (newIndex >= newLines.length) {
        // Remaining lines are deletions
        result.push({
          type: 'remove',
          content: oldLine || '',
          oldLineNumber: oldIndex + 1
        });
        oldIndex++;
      } else if (oldLine === newLine) {
        // Lines are the same - only show context around changes
        if (this.shouldShowContext(result)) {
          result.push({
            type: 'context',
            content: oldLine,
            oldLineNumber: oldIndex + 1,
            newLineNumber: newIndex + 1
          });
        }
        oldIndex++;
        newIndex++;
      } else {
        // Lines are different
        result.push({
          type: 'remove',
          content: oldLine,
          oldLineNumber: oldIndex + 1
        });
        result.push({
          type: 'add',
          content: newLine,
          newLineNumber: newIndex + 1
        });
        oldIndex++;
        newIndex++;
      }
    }
    
    return result;
  }

  /**
   * Determine if we should show context lines (to reduce noise)
   */
  private shouldShowContext(result: DiffLine[]): boolean {
    // Show context if we have recent changes or if it's the beginning
    const recentChanges = result.slice(-3).some(line => line.type !== 'context');
    return recentChanges || result.length < 3;
  }

  /**
   * Get programming language from file path
   */
  private getLanguageFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'tsx',
      'js': 'javascript',
      'jsx': 'jsx',
      'css': 'css',
      'scss': 'scss',
      'json': 'json',
      'md': 'markdown',
      'html': 'markup',
      'xml': 'markup'
    };
    return languageMap[ext || ''] || 'text';
  }
}

export const diffCapture = new DiffCapture();