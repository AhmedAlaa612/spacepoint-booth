import React from 'react';

interface BrutalistTextareaProps {
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number;
  className?: string;
}

export function BrutalistTextarea({ 
  placeholder, 
  value, 
  onChange,
  rows = 4,
  className = '' 
}: BrutalistTextareaProps) {
  return (
    <textarea
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      rows={rows}
      className={`w-full px-4 py-3 bg-purple-950/30 border-[3px] border-dashed border-purple-700 text-purple-100 placeholder:text-purple-500/50 focus:border-purple-500 focus:outline-none focus:ring-0 resize-none ${className}`}
    />
  );
}
