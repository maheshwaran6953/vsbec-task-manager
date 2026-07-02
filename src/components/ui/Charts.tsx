import React from 'react';
import { cn } from '../lib/utils';

export const CircularProgress = ({ value, total, label, color = "text-indigo-600", size = "lg" }: { value: number; total: number; label: string; color?: string; size?: 'sm' | 'lg' }) => {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  const radius = size === 'lg' ? 36 : 18;
  const strokeWidth = size === 'lg' ? 8 : 4;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  const dim = size === 'lg' ? 96 : 48;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={cn("relative", size === 'lg' ? "w-24 h-24" : "w-12 h-12")}>
        <svg className="w-full h-full transform -rotate-90" viewBox={`0 0 ${dim} ${dim}`}>
          <circle cx={dim / 2} cy={dim / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" className="text-zinc-100" />
          <circle
            cx={dim / 2}
            cy={dim / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            style={{ strokeDashoffset: offset }}
            className={cn("transition-all duration-1000 ease-out", color)}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("font-bold text-zinc-900", size === 'lg' ? "text-lg" : "text-[10px]")}>{Math.round(percentage)}%</span>
        </div>
      </div>
      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{label}</span>
    </div>
  );
};

export const SimpleBarChart = ({ data, label, color = "bg-indigo-500" }: { data: { label: string; value: number; total: number }[]; label: string; color?: string }) => {
  return (
    <div className="flex flex-col gap-4 w-full h-full">
      <h4 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-2 border-b border-zinc-100 pb-2">{label}</h4>
      <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
        {data.map((item, i) => {
          const percentage = item.total > 0 ? (item.value / item.total) * 100 : 0;
          return (
            <div key={i} className="group">
              <div className="flex justify-between items-center mb-1.5 text-[11px] font-bold text-zinc-700">
                <span className="truncate mr-4">{item.label}</span>
                <span className="text-zinc-400 font-mono text-[10px] whitespace-nowrap">{item.value}/{item.total}</span>
              </div>
              <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden border border-zinc-200/50">
                <div
                  className={cn("h-full transition-all duration-1000 ease-out rounded-full shadow-sm", color)}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
