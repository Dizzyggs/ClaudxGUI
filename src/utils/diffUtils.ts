import type { DiffData, DiffLine } from '../components/ui/DiffDisplay/types';

export interface FileChange {
  filePath: string;
  operation: 'create' | 'update' | 'delete';
  oldContent?: string;
  newContent?: string;
}

/**
 * Generate diff data from file changes
 */
export function generateDiff(change: FileChange): DiffData {
  const language = getLanguageFromPath(change.filePath);
  
  if (change.operation === 'create') {
    return generateCreateDiff(change, language);
  } else if (change.operation === 'delete') {
    return generateDeleteDiff(change, language);
  } else {
    return generateUpdateDiff(change, language);
  }
}

/**
 * Generate diff for file creation
 */
function generateCreateDiff(change: FileChange, language: string): DiffData {
  const lines = (change.newContent || '').split('\n');
  const diffLines: DiffLine[] = lines.map((content, index) => ({
    type: 'add',
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
function generateDeleteDiff(change: FileChange, language: string): DiffData {
  const lines = (change.oldContent || '').split('\n');
  const diffLines: DiffLine[] = lines.map((content, index) => ({
    type: 'remove',
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
 * Generate diff for file update using a simple line-by-line comparison
 */
function generateUpdateDiff(change: FileChange, language: string): DiffData {
  const oldLines = (change.oldContent || '').split('\n');
  const newLines = (change.newContent || '').split('\n');
  
  // Use Myers algorithm for better diffs (simplified version)
  const diffLines = generateLineDiff(oldLines, newLines);
  
  const additions = diffLines.filter(line => line.type === 'add').length;
  const deletions = diffLines.filter(line => line.type === 'remove').length;

  return {
    filePath: change.filePath,
    operation: 'update',
    language,
    additions,
    deletions,
    lines: diffLines
  };
}

/**
 * Generate line-by-line diff using a simplified diff algorithm
 */
function generateLineDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  
  // Simple line-by-line comparison
  // This is a simplified diff - for production, consider using a library like 'diff'
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    const oldLine = oldLines[oldIndex];
    const newLine = newLines[newIndex];
    
    if (oldIndex >= oldLines.length) {
      // Remaining lines are additions
      result.push({
        type: 'add',
        content: newLine,
        newLineNumber: newIndex + 1
      });
      newIndex++;
    } else if (newIndex >= newLines.length) {
      // Remaining lines are deletions
      result.push({
        type: 'remove',
        content: oldLine,
        oldLineNumber: oldIndex + 1
      });
      oldIndex++;
    } else if (oldLine === newLine) {
      // Lines are the same
      result.push({
        type: 'context',
        content: oldLine,
        oldLineNumber: oldIndex + 1,
        newLineNumber: newIndex + 1
      });
      oldIndex++;
      newIndex++;
    } else {
      // Lines are different - look ahead to see if we can find a match
      let foundMatch = false;
      
      // Look ahead in new lines for old line
      for (let i = newIndex + 1; i < Math.min(newIndex + 5, newLines.length); i++) {
        if (newLines[i] === oldLine) {
          // Found old line later, so current new lines are additions
          for (let j = newIndex; j < i; j++) {
            result.push({
              type: 'add',
              content: newLines[j],
              newLineNumber: j + 1
            });
          }
          newIndex = i;
          foundMatch = true;
          break;
        }
      }
      
      if (!foundMatch) {
        // Look ahead in old lines for new line
        for (let i = oldIndex + 1; i < Math.min(oldIndex + 5, oldLines.length); i++) {
          if (oldLines[i] === newLine) {
            // Found new line later, so current old lines are deletions
            for (let j = oldIndex; j < i; j++) {
              result.push({
                type: 'remove',
                content: oldLines[j],
                oldLineNumber: j + 1
              });
            }
            oldIndex = i;
            foundMatch = true;
            break;
          }
        }
      }
      
      if (!foundMatch) {
        // No match found, treat as deletion + addition
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
  }
  
  return result;
}

/**
 * Get programming language from file path
 */
function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'tsx',
    'js': 'javascript',
    'jsx': 'jsx',
    'css': 'css',
    'scss': 'scss',
    'sass': 'scss',
    'json': 'json',
    'md': 'markdown',
    'html': 'markup',
    'htm': 'markup',
    'xml': 'markup',
    'py': 'python',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'rs': 'rust',
    'go': 'go',
    'rb': 'ruby',
    'php': 'php',
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'sql': 'sql',
    'yaml': 'yaml',
    'yml': 'yaml',
    'toml': 'toml'
  };
  return languageMap[ext || ''] || 'text';
}

/**
 * Truncate diff for large files to prevent UI performance issues
 */
export function truncateDiff(diffData: DiffData, maxLines: number = 100): DiffData {
  if (diffData.lines.length <= maxLines) {
    return diffData;
  }
  
  const truncatedLines = diffData.lines.slice(0, maxLines);
  const remainingLines = diffData.lines.length - maxLines;
  
  // Add a marker for truncated content
  truncatedLines.push({
    type: 'context',
    content: `... ${remainingLines} more lines (diff truncated for performance)`
  });
  
  return {
    ...diffData,
    lines: truncatedLines
  };
}