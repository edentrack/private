import { Clock, Mail, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export function WaitingApprovalPage() {
  const { signOut } = useAuth();

  const handleBackToLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Sign out the pending user so they can log in again
    if (signOut) {
      await signOut();
    }
    
    // Force full navigation for reliable redirect (especially on mobile)
    const base = window.location.pathname || '/';
    window.location.href = base + '#/login';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div className="text-center">
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-10 h-10 text-orange-600" />
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Account Pending Approval
          </h1>

          <p className="text-gray-600 mb-6 leading-relaxed">
            Your account has been created successfully! Our team will review and
            approve your account within 24 hours. You'll receive an email once approved.
          </p>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-8">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-left">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  Check your email
                </p>
                <p className="text-sm text-blue-700">
                  We'll send you a confirmation email as soon as your account is approved.
                  Make sure to check your spam folder too.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleBackToLogin}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              Back to Login
              <ArrowRight className="w-4 h-4" />
            </button>

            <p className="text-sm text-gray-500">
              Questions? Contact our support team
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
