/**
 * Notification Permission Prompt Component
 * Requests permission for push notifications
 */

import { useState, useEffect } from 'react';
import { Bell, X, CheckCircle } from 'lucide-react';
import { requestNotificationPermission, isNotificationSupported, isNotificationPermitted } from '../../lib/pushNotifications';
import { useTranslation } from 'react-i18next';

export function NotificationPermissionPrompt() {
  const { t } = useTranslation();
  const [showPrompt, setShowPrompt] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if (!isNotificationSupported()) {
      return;
    }

    const currentPermission = Notification.permission;
    setPermission(currentPermission);

    // Show prompt if permission hasn't been requested or denied
    if (currentPermission === 'default') {
      // Check if user has dismissed before (stored in localStorage)
      const dismissed = localStorage.getItem('notification-permission-dismissed');
      if (!dismissed) {
        // Show after 3 seconds delay
        const timer = setTimeout(() => {
          setShowPrompt(true);
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleRequestPermission = async () => {
    const newPermission = await requestNotificationPermission();
    setPermission(newPermission);
    
    if (newPermission === 'granted') {
      setShowPrompt(false);
      localStorage.removeItem('notification-permission-dismissed');
    } else if (newPermission === 'denied') {
      setShowPrompt(false);
      localStorage.setItem('notification-permission-dismissed', 'true');
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('notification-permission-dismissed', 'true');
  };

  if (!isNotificationSupported() || permission !== 'default' || !showPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-2 right-2 sm:left-4 sm:right-auto z-50 max-w-sm animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl border-2 border-neon-400 p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-neon-400 to-neon-500 rounded-full flex items-center justify-center">
            <Bell className="w-5 h-5 text-agri-brown-900" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 mb-1">Enable Notifications</h3>
            <p className="text-sm text-gray-600 mb-3">
              Get instant alerts about low stock, overdue tasks, and important farm updates.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleRequestPermission}
                className="flex-1 bg-gradient-to-r from-neon-400 to-neon-500 text-agri-brown-900 px-4 py-2 rounded-lg font-medium text-sm hover:shadow-lg transition-all duration-200"
              >
                Enable
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
              >
                Maybe Later
              </button>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
