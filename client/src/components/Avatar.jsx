import React from 'react';
import { User } from 'lucide-react';

export default function Avatar({ src, name = '', size = 'md', className = '' }) {
  const sizeMap = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-7 h-7 text-xs',
    md: 'w-8 h-8 text-xs',
    lg: 'w-9 h-9 text-sm',
    xl: 'w-12 h-12 text-base',
  };

  const initial = name ? name.trim().charAt(0).toUpperCase() : '';
  const sizeClass = sizeMap[size] || size;

  if (src && typeof src === 'string' && src.trim() !== '') {
    return (
      <img
        src={src}
        alt={name || 'Avatar'}
        className={`${sizeClass} rounded-full object-cover shrink-0 ${className}`}
        onError={(e) => {
          // Se a imagem falhar ao carregar, esconde o elemento img
          e.currentTarget.style.display = 'none';
        }}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-bold flex items-center justify-center shrink-0 uppercase select-none ${className}`}
      title={name || 'Usuário'}
    >
      {initial ? initial : <User className="w-1/2 h-1/2 text-slate-400" />}
    </div>
  );
}
