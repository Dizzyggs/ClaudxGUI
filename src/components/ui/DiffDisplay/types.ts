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