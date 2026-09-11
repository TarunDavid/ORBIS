import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { LogIn, Eye, EyeOff } from 'lucide-react';

const TeacherLogin = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('teacher/login/', { username, password });
      if (res.data.success) {
        const teacher = res.data.teacher;
        localStorage.setItem('teacher_name', teacher.display_name);
        localStorage.setItem('teacher_id', teacher.id.toString());
        localStorage.setItem('teacher_admin', teacher.is_admin ? 'true' : 'false');
        navigate('/teacher/dashboard');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Login failed. Please check your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-syne text-5xl font-[900] text-structural tracking-tight">ORBIS</h1>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="teacher-portal-badge-lg">TEACHER PORTAL</span>
            <span className="neon-dot" title="Offline-ready"></span>
          </div>
          <p className="text-on-surface-variant font-jakarta mt-4">
            Sign in to manage curriculum content
          </p>
        </div>

        {/* Login Card */}
        <form onSubmit={handleLogin} className="clay-card bg-white p-8 space-y-6">
          {error && (
            <div className="clay-card-sm bg-coral/10 border-coral p-3 flex items-center gap-2">
              <span className="text-coral text-sm font-jakarta font-medium">{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <label className="label-text text-xs text-on-surface-variant">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="clay-input w-full px-4 py-3 text-sm"
              placeholder="Enter your username"
              required
              autoFocus
              id="teacher-username"
            />
          </div>

          <div className="space-y-2">
            <label className="label-text text-xs text-on-surface-variant">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="clay-input w-full px-4 py-3 text-sm pr-12"
                placeholder="Enter your password"
                required
                id="teacher-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-structural transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="clay-btn bg-cobalt text-white w-full py-3 text-sm flex items-center justify-center gap-2"
            id="teacher-login-btn"
          >
            {loading ? (
              <div className="clay-spinner" style={{ width: 20, height: 20, borderWidth: 2 }}></div>
            ) : (
              <>
                <LogIn size={16} />
                Sign In
              </>
            )}
          </button>
        </form>

        {/* Back to student view */}
        <div className="text-center mt-6">
          <button
            onClick={() => navigate('/')}
            className="text-on-surface-variant text-sm font-jakarta hover:text-cobalt transition-colors"
          >
            ← Back to Student View
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeacherLogin;
