import React from 'react';
import ResponseCard from '../ResponseCard/ResponseCard';
import TechBadge from '../TechBadge/TechBadge';
import './SmartResponse.scss';

interface SmartResponseProps {
  content: string;
}

interface ParsedSection {
  type: 'dependencies' | 'components' | 'styling' | 'features' | 'analysis' | 'summary' | 'text';
  title: string;
  content: string;
  items?: string[];
  technologies?: Array<{ name: string; type: string }>;
  color?: 'blue' | 'green' | 'orange' | 'purple' | 'pink' | 'teal';
  icon?: string;
  badge?: string;
}

const SmartResponse: React.FC<SmartResponseProps> = ({ content }) => {
  
  const parseContent = (text: string): ParsedSection[] => {
    const sections: ParsedSection[] = [];
    
    // Split by common section headers
    const lines = text.split('\n');
    let currentSection: ParsedSection | null = null;
    let currentContent: string[] = [];
    
    let processedSections = new Set<string>(); // Track processed section types
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Check for section headers
      if ((trimmedLine.toLowerCase().includes('dependencies') || 
           trimmedLine.toLowerCase().includes('package')) &&
          !processedSections.has('dependencies')) {
        if (currentSection) {
          currentSection.content = currentContent.join('\n');
          sections.push(currentSection);
        }
        currentSection = {
          type: 'dependencies',
          title: 'Dependencies',
          content: '',
          color: 'blue',
          icon: '📦',
          technologies: parseTechnologies(text, 'dependencies')
        };
        processedSections.add('dependencies');
        currentContent = [];
      } else if (trimmedLine.toLowerCase().includes('component') && 
                 (trimmedLine.toLowerCase().includes('analysis') || 
                  trimmedLine.toLowerCase().includes('summary')) &&
                 !processedSections.has('components')) {
        if (currentSection) {
          currentSection.content = currentContent.join('\n');
          sections.push(currentSection);
        }
        currentSection = {
          type: 'components',
          title: 'Component Analysis',
          content: '',
          color: 'green',
          icon: '🧩',
          badge: extractComponentCount(text)
        };
        processedSections.add('components');
        currentContent = [];
      } else if ((trimmedLine.toLowerCase().includes('styling') || 
                  trimmedLine.toLowerCase().includes('css') ||
                  trimmedLine.toLowerCase().includes('theme')) &&
                 !processedSections.has('styling')) {
        if (currentSection) {
          currentSection.content = currentContent.join('\n');
          sections.push(currentSection);
        }
        currentSection = {
          type: 'styling',
          title: 'Styling Approach',
          content: '',
          color: 'pink',
          icon: '🎨',
          technologies: parseTechnologies(text, 'styling')
        };
        processedSections.add('styling');
        currentContent = [];
      } else if ((trimmedLine.toLowerCase().includes('feature') ||
                  trimmedLine.toLowerCase().includes('functionality') ||
                  trimmedLine.toLowerCase().includes('key features')) &&
                 !processedSections.has('features')) {
        if (currentSection) {
          currentSection.content = currentContent.join('\n');
          sections.push(currentSection);
        }
        currentSection = {
          type: 'features',
          title: 'Key Features',
          content: '',
          color: 'purple',
          icon: '✨'
        };
        processedSections.add('features');
        currentContent = [];
      } else {
        // Add line to current section content
        if (trimmedLine && !trimmedLine.match(/^(Component Analysis|Key Features|Styling Approach|Dependencies):?$/i)) {
          currentContent.push(trimmedLine);
        }
      }
    }
    
    // Add final section
    if (currentSection) {
      currentSection.content = currentContent.join('\n');
      sections.push(currentSection);
    }
    
    // If no sections were found, treat as general text
    if (sections.length === 0) {
      sections.push({
        type: 'text',
        title: 'Analysis',
        content: text,
        color: 'blue',
        icon: '📄'
      });
    }
    
    return sections;
  };
  
  const parseTechnologies = (text: string, sectionType: string): Array<{ name: string; type: string }> => {
    const technologies: Array<{ name: string; type: string }> = [];
    const lowerText = text.toLowerCase();
    
    // Common technologies to look for
    const techMap = {
      'react': { type: 'framework' },
      'chakra ui': { type: 'library' },
      'tailwind': { type: 'style' },
      'css': { type: 'style' },
      'scss': { type: 'style' },
      'sass': { type: 'style' },
      'typescript': { type: 'language' },
      'javascript': { type: 'language' },
      'emotion': { type: 'style' },
      'firebase': { type: 'tool' },
      'react router': { type: 'library' },
      'framer motion': { type: 'library' },
      'react md editor': { type: 'library' }
    };
    
    Object.entries(techMap).forEach(([tech, config]) => {
      if (lowerText.includes(tech)) {
        technologies.push({
          name: tech.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
          ).join(' '),
          type: config.type
        });
      }
    });
    
    return technologies;
  };
  
  const extractComponentCount = (text: string): string => {
    const matches = text.match(/(\d+)\s*(?:active\s+)?components?/i);
    return matches ? `${matches[1]} components` : '';
  };
  
  const parseHierarchicalList = (items: string[]): Array<{
    content: string;
    description?: string;
    isSubItem: boolean;
  }> => {
    const structuredItems: Array<{
      content: string;
      description?: string;
      isSubItem: boolean;
    }> = [];
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i].trim();
      if (!item) continue;
      
      // Check if this looks like a component/section name
      const isComponentName = item.endsWith('*') || 
                             /^[A-Z][a-zA-Z0-9\s&]*(\*)?:?$/.test(item) ||
                             item.includes('Components (') ||
                             item.includes('Directories (') ||
                             item.includes('Structure & Purpose') ||
                             item.includes('Technical Details');
      
      if (isComponentName) {
        // Look ahead for description
        const nextItem = items[i + 1];
        let description: string | undefined;
        
        // If next item doesn't look like a component name, it's probably a description
        if (nextItem && 
            !nextItem.endsWith('*') && 
            !/^[A-Z][a-zA-Z0-9\s&]*(\*)?:?$/.test(nextItem.trim()) && 
            !nextItem.includes('Components (') && 
            !nextItem.includes('Directories (') &&
            !nextItem.includes('Structure & Purpose') &&
            !nextItem.includes('Technical Details')) {
          description = nextItem.trim();
          i++; // Skip the next item since we used it as description
        }
        
        structuredItems.push({
          content: item,
          description,
          isSubItem: false
        });
      } else {
        // This is a standalone description or regular item
        structuredItems.push({
          content: item,
          isSubItem: false
        });
      }
    }
    
    return structuredItems;
  };
  
  const formatSectionContent = (section: ParsedSection) => {
    const content = section.content;
    
    // Split into items if it looks like a list
    if (content.includes('- ') || content.includes('• ') || content.includes('* ')) {
      const items = content.split(/[-•*]\s+/).filter(item => item.trim());
      
      // Parse hierarchical structure for components
      const structuredItems = parseHierarchicalList(items);
      
      return (
        <ul className="smart-response__list">
          {structuredItems.map((item, index) => (
            <li key={index} className={item.isSubItem ? 'smart-response__sub-item' : ''}>
              {item.isSubItem ? (
                <div className="smart-response__description">
                  {formatText(item.content)}
                </div>
              ) : (
                <>
                  <div className="smart-response__component-name">
                    {formatText(item.content)}
                  </div>
                  {item.description && (
                    <div className="smart-response__description">
                      {formatText(item.description)}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      );
    }
    
    // Split into paragraphs
    const paragraphs = content.split('\n\n').filter(p => p.trim());
    return (
      <div className="smart-response__content">
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{formatText(paragraph)}</p>
        ))}
        
        {/* Add technology badges if available */}
        {section.technologies && section.technologies.length > 0 && (
          <div className="smart-response__tech-section">
            <h4>Technologies:</h4>
            <div className="smart-response__tech-badges">
              {section.technologies.map((tech, index) => (
                <TechBadge 
                  key={index} 
                  name={tech.name} 
                  type={tech.type as any} 
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };
  
  const formatText = (text: string) => {
    // Bold important terms
    return text.replace(/\b(React|Chakra UI|Tailwind|CSS|SCSS|TypeScript|JavaScript|Firebase|Component|Dependencies|Styling)\b/g, '**$1**')
              .split('**').map((part, index) => 
                index % 2 === 1 ? <strong key={index}>{part}</strong> : part
              );
  };
  
  const sections = parseContent(content);
  
  // If content is short and simple, don't break it into cards
  if (content.length < 200 && sections.length === 1 && sections[0].type === 'text') {
    return <div className="smart-response smart-response--simple">{content}</div>;
  }
  
  return (
    <div className="smart-response">
      {sections.map((section, index) => (
        <ResponseCard
          key={index}
          title={section.title}
          icon={section.icon}
          color={section.color}
          badge={section.badge}
          collapsible={section.content.length > 300}
          defaultExpanded={index < 2 || section.content.length <= 300}
        >
          {formatSectionContent(section)}
        </ResponseCard>
      ))}
    </div>
  );
};

export default SmartResponse;