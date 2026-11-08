import React from 'react';

interface BrutalistButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline';
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
  disabled?: boolean;
}

export function BrutalistButton({ 
  children, 
  variant = 'primary', 
  onClick, 
  type = 'button',
  className = '',
  disabled = false
}: BrutalistButtonProps) {
  const variants = {
    primary: 'bg-purple-600 text-white border-purple-400 hover:bg-purple-500 glow-purple-box',
    secondary: 'bg-violet-700 text-white border-violet-400 hover:bg-violet-600',
    outline: 'bg-transparent text-purple-300 border-purple-500 hover:bg-purple-950/50',
  };

  const disabledStyles = 'opacity-50 cursor-not-allowed transform-none hover:transform-none shadow-none hover:shadow-none';

  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`px-6 py-3 border-[4px] border-dashed ${variants[variant]} uppercase tracking-wider transition-all duration-200 hover:-translate-y-1 active:translate-y-0 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,0.3)] ${disabled ? disabledStyles : ''} ${className}`}
    >
      {children}
    </button>
  );
}
