import React from 'react';
import { cn } from '../lib/utils';

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse bg-zinc-200 rounded-lg", className)} />
);

export const EmptyState = ({ icon: Icon, title, description }: { icon: any, title: string, description: string }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-zinc-200 rounded-3xl bg-zinc-50/50">
    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-zinc-400 mb-4 shadow-sm">
      <Icon size={32} />
    </div>
    <h3 className="text-xl font-bold text-zinc-900 mb-2">{title}</h3>
    <p className="text-zinc-500 max-w-sm">{description}</p>
  </div>
);
