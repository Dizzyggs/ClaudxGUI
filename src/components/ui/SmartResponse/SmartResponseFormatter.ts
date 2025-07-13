// Smart response formatter that detects and formats analysis responses

export interface FormattedResponse {
  isFormatted: boolean;
  content: string;
  sections?: {
    title: string;
    content: string;
    icon?: string;
  }[];
}

export class SmartResponseFormatter {
  
  /**
   * Detects if a response is an analysis that should be formatted
   */
  static isAnalysisResponse(text: string): boolean {
    const analysisKeywords = [
      'based on my analysis',
      'here\'s what i found',
      'project analysis',
      'tech stack',
      'architecture',
      'what it is',
      'how it\'s built',
      'best practices',
      'areas for improvement',
      'recommendations',
      'frontend:',
      'backend:',
      'database:',
      'component structure',
      'good practices',
      'missing'
    ];

    const lowerText = text.toLowerCase();
    const keywordMatches = analysisKeywords.filter(keyword => 
      lowerText.includes(keyword)
    ).length;

    // Consider it analysis if it has multiple keywords and is long
    return keywordMatches >= 2 && text.length > 500;
  }

  /**
   * Formats an analysis response into structured sections
   */
  static formatAnalysisResponse(text: string): FormattedResponse {
    if (!this.isAnalysisResponse(text)) {
      return {
        isFormatted: false,
        content: text
      };
    }

    const sections = this.extractSections(text);
    const formattedContent = this.generateFormattedContent(sections);

    return {
      isFormatted: true,
      content: formattedContent,
      sections
    };
  }

  /**
   * Extracts logical sections from the analysis text
   */
  private static extractSections(text: string): { title: string; content: string; icon?: string }[] {
    const sections: { title: string; content: string; icon?: string }[] = [];
    
    // Split text into sentences for processing
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let currentSection = '';
    let currentContent: string[] = [];

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;

      // Detect section headers based on content
      const sectionType = this.detectSectionType(trimmed);
      
      if (sectionType && currentSection !== sectionType) {
        // Save previous section
        if (currentSection && currentContent.length > 0) {
          sections.push({
            title: currentSection,
            content: currentContent.join('. ') + '.',
            icon: this.getSectionIcon(currentSection)
          });
        }
        
        // Start new section
        currentSection = sectionType;
        currentContent = [trimmed];
      } else {
        currentContent.push(trimmed);
      }
    }

    // Add final section
    if (currentSection && currentContent.length > 0) {
      sections.push({
        title: currentSection,
        content: currentContent.join('. ') + '.',
        icon: this.getSectionIcon(currentSection)
      });
    }

    // If no sections detected, create default structure
    if (sections.length === 0) {
      return this.createDefaultSections(text);
    }

    return sections;
  }

  /**
   * Detects what type of section a sentence belongs to
   */
  private static detectSectionType(sentence: string): string | null {
    const lower = sentence.toLowerCase();

    if (lower.includes('this is a') || lower.includes('what it is') || lower.includes('react-based') || lower.includes('platform with')) {
      return 'Project Overview';
    }
    
    if (lower.includes('frontend:') || lower.includes('backend:') || lower.includes('tech stack') || 
        lower.includes('react') || lower.includes('typescript') || lower.includes('node.js')) {
      return 'Technology Stack';
    }
    
    if (lower.includes('architecture') || lower.includes('component') || lower.includes('structure') || 
        lower.includes('organized') || lower.includes('routing')) {
      return 'Architecture & Structure';
    }
    
    if (lower.includes('good practices') || lower.includes('well-structured') || lower.includes('typescript for type') ||
        lower.includes('responsive layout') || lower.includes('proper separation')) {
      return 'Strengths & Good Practices';
    }
    
    if (lower.includes('missing') || lower.includes('no error') || lower.includes('areas for improvement') ||
        lower.includes('could be enhanced') || lower.includes('no ci/cd') || lower.includes('no deployment')) {
      return 'Areas for Improvement';
    }
    
    if (lower.includes('firebase') || lower.includes('authentication') || lower.includes('database') ||
        lower.includes('storage') || lower.includes('firestore')) {
      return 'Services & Integrations';
    }

    return null;
  }

  /**
   * Gets an appropriate icon for each section type
   */
  private static getSectionIcon(sectionTitle: string): string {
    const iconMap: { [key: string]: string } = {
      'Project Overview': '📊',
      'Technology Stack': '⚙️',
      'Architecture & Structure': '🏗️',
      'Strengths & Good Practices': '✅',
      'Areas for Improvement': '⚠️',
      'Services & Integrations': '🔗',
      'Security & Best Practices': '🔒',
      'Performance & Optimization': '⚡',
      'Development & Testing': '🧪'
    };

    return iconMap[sectionTitle] || '📝';
  }

  /**
   * Creates default sections when automatic detection fails
   */
  private static createDefaultSections(text: string): { title: string; content: string; icon?: string }[] {
    // Split text into roughly equal parts
    const words = text.split(' ');
    const midPoint = Math.floor(words.length / 2);
    
    const firstHalf = words.slice(0, midPoint).join(' ');
    const secondHalf = words.slice(midPoint).join(' ');

    return [
      {
        title: 'Analysis Overview',
        content: firstHalf,
        icon: '📊'
      },
      {
        title: 'Technical Details',
        content: secondHalf,
        icon: '⚙️'
      }
    ];
  }

  /**
   * Generates formatted HTML content from sections
   */
  private static generateFormattedContent(sections: { title: string; content: string; icon?: string }[]): string {
    let formatted = '<h2>📊 Project Analysis</h2>';
    
    sections.forEach(section => {
      formatted += `<h3>${section.icon || '📝'} ${section.title}</h3>`;
      
      // Format content as bullet points for better readability
      const bulletPoints = this.formatAsBulletPoints(section.content);
      formatted += bulletPoints;
    });

    return formatted;
  }

  /**
   * Formats content as structured bullet points
   */
  private static formatAsBulletPoints(content: string): string {
    // Split by common separators and create bullet points
    const points = content
      .split(/[-•·]|(?:\s*-\s*)|(?:\.\s+)/)
      .filter(point => point.trim().length > 20) // Only substantial points
      .map(point => point.trim())
      .filter(point => point.length > 0);

    if (points.length <= 1) {
      // If can't split meaningfully, return as paragraph
      return `<p>${content}</p>`;
    }

    const listItems = points.map(point => `<li>${point}</li>`).join('');
    return `<ul>${listItems}</ul>`;
  }

  /**
   * Formats any long response for better readability
   */
  static formatLongResponse(text: string): FormattedResponse {
    // First check if it's an analysis response
    const analysisResult = this.formatAnalysisResponse(text);
    if (analysisResult.isFormatted) {
      return analysisResult;
    }

    // If not analysis but still long, apply basic formatting
    if (text.length > 300) {
      const formatted = this.applyBasicFormatting(text);
      return {
        isFormatted: true,
        content: formatted
      };
    }

    return {
      isFormatted: false,
      content: text
    };
  }

  /**
   * Applies basic formatting to long responses
   */
  private static applyBasicFormatting(text: string): string {
    // Add line breaks after sentences for better readability
    let formatted = text
      .replace(/\.\s+([A-Z])/g, '.\n\n$1') // Add breaks after sentences
      .replace(/:\s*([A-Z])/g, ':\n- $1') // Convert colons to bullet points
      .replace(/\s*-\s*/g, '\n- '); // Clean up bullet points

    return formatted;
  }
}

