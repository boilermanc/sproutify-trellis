import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, Sprout } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface LoginProps {
  onForgotPassword: () => void;
}

const Login: React.FC<LoginProps> = ({ onForgotPassword }) => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      setError(signInError);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white border border-slate-200 p-6 sm:p-10">
          <div className="flex items-center justify-center mb-8">
            <div className="w-12 h-12 border border-emerald-200 bg-emerald-50 flex items-center justify-center">
              <Sprout className="w-8 h-8 text-emerald-600" />
            </div>
          </div>

          <h1 className="text-2xl font-black text-slate-800 text-center mb-2">Welcome to Trellis</h1>
          <p className="text-slate-500 text-center text-sm mb-8">Sign in to your account</p>

          {error && (
            <div className="bg-red-50 border border-red-200 p-4 mb-6">
              <p className="text-red-700 text-sm font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block font-mono text-xs font-bold text-slate-500 tracking-wide mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-11 px-4 py-3 bg-white border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition font-medium text-sm"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block font-mono text-xs font-bold text-slate-500 tracking-wide mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-11 px-4 py-3 pr-12 bg-white border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition font-medium text-sm"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-11 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-sm transition flex items-center justify-center"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={onForgotPassword}
              className="text-sm text-emerald-600 hover:text-emerald-700 font-medium transition"
            >
              Forgot your password?
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
