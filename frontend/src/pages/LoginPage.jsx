import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';

// Set your Google Client ID here or in .env
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function LoginPage() {
  useEffect(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
  }, []);

  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const googleBtnRef = useRef(null);

  // Handle Google credential response
  const handleGoogleResponse = useCallback(async (response) => {
    setLoading(true); setError('');
    try {
      const { access_token, role: userRole, username: uname } = await api.googleLogin(response.credential);
      localStorage.setItem('token', access_token);
      localStorage.setItem('role', userRole);
      localStorage.setItem('username', uname);
      navigate(userRole === 'student' ? '/student' : '/');
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  }, [navigate]);

  // Initialize Google Sign-In
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const interval = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(interval);
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
          auto_select: false,
        });
        if (googleBtnRef.current) {
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'outline', size: 'large', width: '100%',
            text: 'signin_with', shape: 'rectangular',
          });
        }
      }
    }, 200);
    return () => clearInterval(interval);
  }, [handleGoogleResponse]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess(''); setLoading(true);
    try {
      if (isRegister) {
        const res = await api.register(username, email, password, role);
        setSuccess(res.message || 'Account created! Wait for admin approval.');
        setIsRegister(false);
      } else {
        const { access_token, role: userRole, username: uname } = await api.login(username, password);
        localStorage.setItem('token', access_token);
        localStorage.setItem('role', userRole);
        localStorage.setItem('username', uname);
        navigate(userRole === 'student' ? '/student' : '/');
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="card">
          <div className="logo-section">
            <div className="logo-icon">PG</div>
            <h2>PacketGrader</h2>
            <p className="subtitle">AI-Powered Cisco Lab Evaluation</p>
          </div>

          {success && (
            <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 20, color: 'var(--success)', fontSize: 14, textAlign: 'center' }}>
              ✓ {success}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input className="form-input" value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter username" required />
            </div>
            {isRegister && (
              <>
                <div className="form-group">
                  <label className="form-label">Email (@bitsathy.ac.in)</label>
                  <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="yourname@bitsathy.ac.in" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-select" value={role} onChange={e => setRole(e.target.value)}>
                    <option value="student">Student</option>
                    <option value="professor">Professor</option>
                  </select>
                </div>
              </>
            )}
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" required />
            </div>
            {error && <p style={{ color: 'var(--danger)', fontSize: 14, marginBottom: 16, textAlign: 'center' }}>{error}</p>}
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
              {loading ? '⏳ Please wait...' : isRegister ? '🚀 Create Account' : '🔐 Sign In'}
            </button>
          </form>

          <div className="divider">or</div>

          {/* Google Sign-In Button */}
          {GOOGLE_CLIENT_ID ? (
            <div ref={googleBtnRef} style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }} />
          ) : (
            <button className="btn btn-google" type="button"
              onClick={() => setError('Google OAuth requires VITE_GOOGLE_CLIENT_ID. Set it in frontend/.env')}>
              <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Sign in with Google (@bitsathy.ac.in)
            </button>
          )}

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--text-secondary)' }}>
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); setIsRegister(!isRegister); setError(''); setSuccess(''); }}>
              {isRegister ? 'Sign In' : 'Register'}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
