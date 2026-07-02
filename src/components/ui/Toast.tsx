import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { cn } from '../lib/utils';
import type { ToastMessage } from '../types';

export const ToastContainer = ({ toasts, removeToast }: { toasts: ToastMessage[], removeToast: (id: string) => void }) => {
  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            className={cn(
              "p-4 rounded-xl shadow-lg border flex items-start gap-3 w-80 pointer-events-auto backdrop-blur-md",
              toast.type === 'success' ? "bg-emerald-50/90 border-emerald-200 text-emerald-800" :
                toast.type === 'error' ? "bg-red-50/90 border-red-200 text-red-800" :
                  "bg-blue-50/90 border-blue-200 text-blue-800"
            )}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' ? <CheckCircle2 size={18} className="text-emerald-500" /> :
                toast.type === 'error' ? <XCircle size={18} className="text-red-500" /> :
                  <Info size={18} className="text-blue-500" />}
            </div>
            <p className="text-sm font-medium flex-1">{toast.message}</p>
            <button onClick={() => removeToast(toast.id)} className="shrink-0 text-zinc-400 hover:text-black transition-colors">
              <X size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
