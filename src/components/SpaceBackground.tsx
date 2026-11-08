import React from 'react';
import { Rocket, Satellite, Sparkles, Star, CircleDot, Orbit } from 'lucide-react';

export function SpaceBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-5 z-0">
      <div className="absolute top-10 left-10">
        <Star size={24} className="text-purple-400" />
      </div>
      <div className="absolute top-20 right-20">
        <Sparkles size={28} className="text-purple-400" />
      </div>
      <div className="absolute top-40 left-1/4">
        <Rocket size={32} className="text-purple-400 rotate-45" />
      </div>
      <div className="absolute top-60 right-1/3">
        <Satellite size={30} className="text-purple-400" />
      </div>
      <div className="absolute bottom-40 left-20">
        <CircleDot size={26} className="text-purple-400" />
      </div>
      <div className="absolute bottom-60 right-40">
        <Orbit size={28} className="text-purple-400" />
      </div>
      <div className="absolute top-1/2 left-10">
        <Star size={20} className="text-purple-400" />
      </div>
      <div className="absolute bottom-20 right-20">
        <Sparkles size={24} className="text-purple-400" />
      </div>
      <div className="absolute top-32 right-1/4">
        <CircleDot size={22} className="text-purple-400" />
      </div>
      <div className="absolute bottom-32 left-1/3">
        <Satellite size={26} className="text-purple-400 -rotate-12" />
      </div>
    </div>
  );
}
