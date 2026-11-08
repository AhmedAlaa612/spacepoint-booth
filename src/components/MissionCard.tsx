import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MissionCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  rotation?: number;
}

export function MissionCard({ icon: Icon, title, description, rotation = 0 }: MissionCardProps) {
  return (
    <div 
      className="relative bg-purple-950/40 border-[4px] border-dashed border-purple-700/60 p-6 hover:border-purple-500 hover:bg-purple-900/40 transition-all duration-300 group"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <div className="absolute -top-3 -right-3 bg-purple-500 text-purple-950 w-8 h-8 rounded-full flex items-center justify-center border-[3px] border-purple-950 group-hover:scale-110 transition-transform">
        <Icon size={16} strokeWidth={3} />
      </div>
      <Icon size={40} className="text-purple-400 mb-4" strokeWidth={2} />
      <h3 className="text-xl mb-2 text-purple-100 uppercase tracking-wide">{title}</h3>
      <p className="text-purple-300/80">{description}</p>
    </div>
  );
}
