import React from 'react';
import { useSocket } from '../context/SocketContext';
import { AlertCircle, CheckCircle, Info, Clock, X } from 'lucide-react';

export default function NotificationToast() {
  const { notifications, removeNotification } = useSocket();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {notifications.map((n) => {
        let borderClass = 'border-amber-500/40 bg-amber-950/80 text-amber-200';
        let Icon = AlertCircle;

        if (n.type === 'success') {
          borderClass = 'border-emerald-500/40 bg-emerald-950/80 text-emerald-200';
          Icon = CheckCircle;
        } else if (n.type === 'info') {
          borderClass = 'border-blue-500/40 bg-blue-950/80 text-blue-200';
          Icon = Info;
        } else if (n.type === 'sniper') {
          borderClass = 'border-red-500/40 bg-red-950/80 text-red-200';
          Icon = Clock;
        }

        return (
          <div
            key={n.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-300 animate-in slide-in-from-right ${borderClass}`}
          >
            <Icon className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm leading-tight text-white">{n.title}</h4>
              <p className="text-xs mt-0.5 opacity-90 leading-relaxed">{n.message}</p>
            </div>
            <button
              onClick={() => removeNotification(n.id)}
              className="text-slate-400 hover:text-white p-1 rounded-lg shrink-0 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
