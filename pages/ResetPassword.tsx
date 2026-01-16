import React, { useState } from 'react';
import { ArrowLeft, Loader2, Mail, Sprout } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface ResetPasswordProps {
  onBackToLogin: () => void;
}

const ResetPassword: React.FC<ResetPasswordProps> = ({ onBackToLogin }) => {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: resetError } = await resetPassword(email);

    if (resetError) {
      setError(resetError);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl p-10">
          <div className="flex items-center justify-center mb-8">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center">
              <Sprout className="w-8 h-8 text-emerald-600" />
            </div>
          </div>

          {success ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Mail className="w-8 h-8 text-emerald-600" />
              </div>
              <h1 className="text-2xl font-black text-slate-800 mb-2">Check your email</h1>
              <p className="text-slate-500 text-sm mb-8">
                We've sent a password reset link to <strong>{email}</strong>
              </p>
              <button
                onClick={onBackToLogin}
                className="text-sm text-emerald-600 hover:text-emerald-700 font-medium transition flex items-center justify-center mx-auto"
              >
                <ArrowLeft size={16} className="mr-1" />
                Back to login
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-black text-slate-800 text-center mb-2">Reset Password</h1>
              <p className="text-slate-500 text-center text-sm mb-8">
                Enter your email and we'll send you a reset link
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                  <p className="text-red-700 text-sm font-medium">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition font-medium text-sm"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl font-black text-sm uppercase tracking-widest transition flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Sending...
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <button
                  onClick={onBackToLogin}
                  className="text-sm text-slate-500 hover:text-slate-700 font-medium transition flex items-center justify-center mx-auto"
                >
                  <ArrowLeft size={16} className="mr-1" />
                  Back to login
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
