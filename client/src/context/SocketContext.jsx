import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { getBackendBaseUrl } from '../services/api';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const { user, updateUserBalance } = useAuth();

  useEffect(() => {
    // Conectar ao backend (suporta Web e APK Nativo)
    const socketUrl = getBackendBaseUrl() || window.location.origin;
    const socketInstance = io(socketUrl, {
      transports: ['websocket', 'polling'],
      extraHeaders: {
        'bypass-tunnel-reminder': 'true'
      }
    });

    socketInstance.on('connect', () => {
      setConnected(true);
    });

    socketInstance.on('disconnect', () => {
      setConnected(false);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  // Ouvir notificações específicas do usuário atual (ex: lance superado e reembolso recebido)
  useEffect(() => {
    if (!socket || !user) return;

    const outbidEvent = `user_outbid_${user.id}`;
    const handleOutbid = (data) => {
      // Atualizar saldo instantaneamente no frontend
      updateUserBalance(data.newBalance);

      addNotification({
        id: Date.now(),
        type: 'warning',
        title: 'Seu lance foi superado!',
        message: `No item "${data.itemTitle}". ${data.refundedAmount} pontos foram devolvidos ao seu saldo.`,
        duration: 8000
      });
    };

    socket.on(outbidEvent, handleOutbid);

    return () => {
      socket.off(outbidEvent, handleOutbid);
    };
  }, [socket, user]);

  const addNotification = (notif) => {
    const id = notif.id || Date.now();
    setNotifications(prev => [ { ...notif, id }, ...prev ]);

    if (notif.duration !== 0) {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, notif.duration || 5000);
    }
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        connected,
        notifications,
        addNotification,
        removeNotification
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket deve ser usado dentro de um SocketProvider');
  }
  return context;
}
