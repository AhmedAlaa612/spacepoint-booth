import React from 'react';

interface StampLabelProps {
  text: string;
  variant?: 'primary' | 'secondary' | 'accent';
  rotation?: number;
}

export function StampLabel({ text, variant = 'primary', rotation = 0 }: StampLabelProps) {
  const colors = {
    primary: 'border-purple-500 text-purple-400 bg-purple-950/50',
    secondary: 'border-violet-400 text-violet-300 bg-violet-950/50',
    accent: 'border-cyan-400 text-cyan-300 bg-cyan-950/50',
  };

  return (
    <div 
      className={`inline-block px-3 py-1.5 border-[3px] border-dashed ${colors[variant]} uppercase tracking-wider text-xs rotate-${rotation}`}
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      {text}
    </div>
  );
}
