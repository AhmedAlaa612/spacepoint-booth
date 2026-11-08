import React from 'react';

interface BrutalistInputProps {
  placeholder?: string;
  type?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
}

export function BrutalistInput({ 
  placeholder, 
  type = 'text', 
  value, 
  onChange,
  className = '' 
}: BrutalistInputProps) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className={`w-full px-4 py-3 bg-purple-950/30 border-[3px] border-dashed border-purple-700 text-purple-100 placeholder:text-purple-500/50 focus:border-purple-500 focus:outline-none focus:ring-0 ${className}`}
    />
  );
}
