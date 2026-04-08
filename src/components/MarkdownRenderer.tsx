import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
}

const MarkdownRenderer = ({ content }: Props) => {
  return (
    <div className="markdown-body">
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
    </div>
  );
};

export default MarkdownRenderer;
