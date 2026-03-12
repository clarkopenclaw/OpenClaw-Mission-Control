import { useEffect, useState } from 'react';

type StatusBarProps = {
  initialNow?: Date;
  onlineOverride?: boolean;
};

function readOnlineStatus(): boolean {
  if (typeof navigator === 'undefined') {
    return true;
  }

  return navigator.onLine;
}

export default function StatusBar({ initialNow, onlineOverride }: StatusBarProps) {
  const [now, setNow] = useState<Date>(() => initialNow ?? new Date());
  const [isOnline, setIsOnline] = useState<boolean>(() => onlineOverride ?? readOnlineStatus());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (onlineOverride !== undefined) {
      setIsOnline(onlineOverride);
      return;
    }

    const syncOnlineStatus = () => {
      setIsOnline(readOnlineStatus());
    };

    syncOnlineStatus();
    window.addEventListener('online', syncOnlineStatus);
    window.addEventListener('offline', syncOnlineStatus);

    return () => {
      window.removeEventListener('online', syncOnlineStatus);
      window.removeEventListener('offline', syncOnlineStatus);
    };
  }, [onlineOverride]);

  return (
    <footer className="status-bar">
      <time
        className="status-bar__time mono"
        aria-label="Current time"
        dateTime={now.toISOString()}
        title={now.toISOString()}
      >
        {now.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </time>

      <span className="status-bar__version">Mission Control v0.1</span>

      <span className="status-bar__connection" aria-label={`Connection status: ${isOnline ? 'online' : 'offline'}`}>
        <span className={isOnline ? 'status-bar__dot online' : 'status-bar__dot offline'} aria-hidden="true" />
      </span>
    </footer>
  );
}
