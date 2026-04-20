import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { canViewModule, ModuleName } from '../../utils/navigationPermissions';
import type { Role } from '../../utils/rolePermissions';
import { AlertCircle } from 'lucide-react';

interface RequireRoleProps {
  children: ReactNode;
  moduleId: ModuleName;
  fallbackView?: 'redirect' | 'message';
  onUnauthorized?: () => void;
}

export function RequireRole({
  children,
  moduleId,
  fallbackView = 'redirect',
  onUnauthorized
}: RequireRoleProps) {
  const { currentRole, loading } = useAuth();
  const { farmPermissions } = usePermissions();
  const [showMessage, setShowMessage] = useState(false);

  // Compute access synchronously to avoid flash of "no access" when user has access
  const normalizedRole = currentRole?.toLowerCase?.() as Role | undefined;
  const visibility = canViewModule(normalizedRole, moduleId, farmPermissions);
  const hasAccess = !loading && !!normalizedRole && visibility.visible;

  useEffect(() => {
    if (!loading && normalizedRole && !visibility.visible) {
      setTimeout(() => setShowMessage(true), 300);
      if (fallbackView === 'redirect' && onUnauthorized) {
        const t = setTimeout(onUnauthorized, 2000);
        return () => clearTimeout(t);
      }
    } else {
      setShowMessage(false);
    }
  }, [loading, normalizedRole, visibility.visible, fallbackView, onUnauthorized]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess && showMessage) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 max-w-md text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Restricted</h2>
          <p className="text-gray-600 mb-4">
            You do not have permission to access this module.
          </p>
          {fallbackView === 'redirect' && (
            <p className="text-sm text-gray-500">
              Redirecting to dashboard...
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return <>{children}</>;
}
