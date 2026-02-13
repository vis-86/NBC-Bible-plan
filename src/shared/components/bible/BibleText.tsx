'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { ReadingSettings } from '@/features/reading/types';

interface BibleTextProps {
  text: string;
  settings: ReadingSettings;
  displayTheme?: 'light' | 'dark' | 'sepia';
}

export const BibleText: React.FC<BibleTextProps> = ({ text, settings, displayTheme }) => {
  const themeForColor = displayTheme ?? (settings.theme === 'system' ? 'light' : settings.theme) as 'light' | 'dark' | 'sepia';
  const textAlignClass = settings.text_align === 'center' ? 'text-center' : 
                         settings.text_align === 'justify' ? 'text-justify' : 'text-left';
  const textColorClass = themeForColor === 'dark' ? 'text-stone-100' : 
                        themeForColor === 'sepia' ? 'text-stone-900' : 'text-stone-800';

  return (
    <article className="prose prose-stone prose-lg">
      <ReactMarkdown 
        components={{
          p: ({node, children, ...props}) => {
            const processNode = (node: React.ReactNode, isFirst: { value: boolean }): React.ReactNode => {
              if (typeof node === 'string') {
                const parts = node.split(/(\*\*\d+\*\*)/g);
                return parts.map((part, index) => {
                  const verseMatch = part.match(/\*\*(\d+)\*\*/);
                  if (verseMatch) {
                    const verseNum = verseMatch[1];
                    if (!isFirst.value) {
                      isFirst.value = false;
                      return (
                        <span key={`verse-indent-${index}`} className="inline-block ml-4">
                          <strong>{verseNum}</strong>{' '}
                        </span>
                      );
                    } else {
                      isFirst.value = false;
                      return <strong key={`verse-${index}`}>{verseNum} </strong>;
                    }
                  }
                  if (part.trim().length > 0) {
                    isFirst.value = false;
                  }
                  return <span key={`text-${index}`}>{part}</span>;
                });
              }
              
              if (React.isValidElement(node) && node.type === 'strong') {
                const verseText = (node.props as any)?.children;
                if (typeof verseText === 'string' && /^\d+$/.test(verseText.trim())) {
                  if (!isFirst.value) {
                    isFirst.value = false;
                    return (
                      <span className="inline-block ml-4">
                        <strong>{verseText}</strong>{' '}
                      </span>
                    );
                  } else {
                    isFirst.value = false;
                    return node;
                  }
                }
              }
              
              return node;
            };
            
            const isFirst = { value: true };
            const processedChildren = React.Children.map(children, (child) => processNode(child, isFirst));
            
            return <p 
              className={`mb-6 ${textColorClass} font-serif ${textAlignClass}`}
              style={{ 
                fontSize: `${settings.font_size}px`, 
                lineHeight: settings.line_height 
              }}
              {...props}
            >{processedChildren}</p>;
          },
          strong: ({node, children, ...props}) => {
            if (typeof children === 'string' && /^\d+$/.test(children.trim())) {
              if (!settings.verse_numbers_visible) {
                return null;
              }
              return <strong className="font-bold" {...props}>{children}</strong>;
            }
            return <span className="text-red-600 font-sans text-[0.55em] font-bold mr-1 -ml-2 -mt-1 align-top select-none opacity-60 relative top-[-2px]" {...props}>{children}</span>;
          }
        }}
      >
        {text.split(/(\d+\s+)/g).map((part, index) => {
          if (/^\d+\s+$/.test(part)) {
            return `**${part.trim()}** `;
          }
          return part;
        }).join('')}
      </ReactMarkdown>
    </article>
  );
};

