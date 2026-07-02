import React from 'react';
import { cn } from '../lib/utils';

export const Button = ({ className, variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' }) => {
  const variants = {
    primary: 'bg-black text-white hover:bg-zinc-800',
    secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    ghost: 'hover:bg-zinc-100 text-zinc-600',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700'
  };
  return (
    <button
      className={cn('px-4 py-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50', variants[variant], className)}
      {...props}
    />
  );
};

export const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={cn('w-full px-4 py-2 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all', className)}
    {...props}
  />
);

export const Card = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm', className)} {...props}>
    {children}
  </div>
);
