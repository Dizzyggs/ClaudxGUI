/**
 * Get appropriate icon for file type
 */
export const getFileIcon = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  switch (ext) {
    // Documents
    case 'txt':
    case 'md':
    case 'readme':
      return '📄';
    
    // Images
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'bmp':
    case 'ico':
      return '📷';
    
    // Code files
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return '📜';
    
    case 'html':
    case 'htm':
      return '🌐';
    
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return '🎨';
    
    case 'json':
    case 'xml':
    case 'yaml':
    case 'yml':
      return '📋';
    
    case 'py':
      return '🐍';
    
    case 'java':
      return '☕';
    
    case 'php':
      return '🐘';
    
    case 'rb':
      return '💎';
    
    case 'go':
      return '🐹';
    
    case 'rs':
      return '🦀';
    
    case 'cpp':
    case 'c':
    case 'h':
      return '⚙️';
    
    case 'cs':
      return '🔷';
    
    case 'swift':
      return '🍎';
    
    case 'kt':
      return '🟧';
    
    // Config files
    case 'env':
    case 'config':
    case 'conf':
    case 'ini':
      return '⚙️';
    
    case 'gitignore':
    case 'gitattributes':
      return '🔧';
    
    // Package files
    case 'package':
      return '📦';
    
    case 'lock':
      return '🔒';
    
    // Database
    case 'sql':
    case 'db':
    case 'sqlite':
      return '🗃️';
    
    // Archives
    case 'zip':
    case 'rar':
    case 'tar':
    case 'gz':
    case '7z':
      return '🗜️';
    
    // Executables
    case 'exe':
    case 'app':
    case 'deb':
    case 'rpm':
      return '⚡';
    
    // Shell scripts
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish':
    case 'ps1':
    case 'bat':
    case 'cmd':
      return '🖥️';
    
    // Logs
    case 'log':
      return '📝';
    
    // Fonts
    case 'ttf':
    case 'otf':
    case 'woff':
    case 'woff2':
      return '🔤';
    
    // Videos
    case 'mp4':
    case 'avi':
    case 'mov':
    case 'wmv':
    case 'flv':
    case 'webm':
      return '🎬';
    
    // Audio
    case 'mp3':
    case 'wav':
    case 'flac':
    case 'ogg':
    case 'aac':
      return '🎵';
    
    // PDFs
    case 'pdf':
      return '📕';
    
    // Office documents
    case 'doc':
    case 'docx':
      return '📘';
    
    case 'xls':
    case 'xlsx':
      return '📊';
    
    case 'ppt':
    case 'pptx':
      return '📈';
    
    // Default
    default:
      return '📁';
  }
};

/**
 * Get file type category for styling
 */
export const getFileCategory = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  // Image files
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext || '')) {
    return 'image';
  }
  
  // Code files
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'scss', 'py', 'java', 'php', 'rb', 'go', 'rs', 'cpp', 'c', 'cs'].includes(ext || '')) {
    return 'code';
  }
  
  // Documents
  if (['txt', 'md', 'pdf', 'doc', 'docx'].includes(ext || '')) {
    return 'document';
  }
  
  // Config files
  if (['json', 'xml', 'yaml', 'yml', 'env', 'config', 'conf'].includes(ext || '')) {
    return 'config';
  }
  
  return 'default';
};