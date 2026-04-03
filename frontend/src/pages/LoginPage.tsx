
import { useState, Suspense, lazy, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import './LoginPage.css';

const BrainScene = lazy(() => import('../components/BrainScene'));

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login    = useAuthStore((s) => s.login);
  const loading  = useAuthStore((s) => s.loading);
  const error    = useAuthStore((s) => s.error);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await login(username, password);
    if (ok) navigate('/patient');
  };

  const fillDemo = (u: string, p: string) => { setUsername(u); setPassword(p); };

  return (
    <div className="lp-root">

      <div className="lp-canvas">
        <Suspense fallback={null}>
          <BrainScene />
        </Suspense>
      </div>

      <div className="lp-vignette" />

      <div className="lp-left">
        <header className="lp-header">

          <svg className="lp-logomark" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="20" cy="20" r="19" stroke="url(#g1)" strokeWidth="1.5"/>
            <path d="M10 20 Q15 10 20 20 Q25 30 30 20" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" fill="none"/>
            <circle cx="20" cy="20" r="3.5" fill="#06b6d4"/>
            <defs>
              <linearGradient id="g1" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#06b6d4"/>
                <stop offset="100%" stopColor="#818cf8"/>
              </linearGradient>
            </defs>
          </svg>
          <div className="lp-brand-group">
            <span className="lp-brand">NeuroSight</span>
            <span className="lp-brand-sub">Clinical AI Platform</span>
          </div>
        </header>

        <div className="lp-hero">
          <h1 className="lp-hero-title">Brain Tumor<br/>Segmentation</h1>
          <p className="lp-hero-sub">
            AI-powered MRI analysis with real-time 3D rendering,<br/>
            automated segmentation, and clinical decision support.
          </p>
        </div>

        <div className="lp-badges">
          <div className="lp-badge">
            <span className="lp-badge-val">0.91</span>
            <span className="lp-badge-lbl">Dice Score</span>
          </div>
          <div className="lp-badge">
            <span className="lp-badge-val">WT · TC · ET</span>
            <span className="lp-badge-lbl">Regions</span>
          </div>
          <div className="lp-badge">
            <span className="lp-badge-val">Real-time</span>
            <span className="lp-badge-lbl">3D Viewer</span>
          </div>
        </div>
      </div>

      <aside className="lp-sidebar">
        <div className="lp-card">

          <div className="lp-card-head">
            <h2>Welcome back</h2>
            <p>Sign in to your clinical workspace</p>
          </div>

          <form onSubmit={handleSubmit} className="lp-form">
            <div className="lp-field">
              <label htmlFor="lp-username">Username</label>
              <div className="lp-input-wrap">
                <svg className="lp-ico" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 10a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0H3z"/>
                </svg>
                <input
                  id="lp-username"
                  className="lp-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            <div className="lp-field">
              <label htmlFor="lp-password">Password</label>
              <div className="lp-input-wrap">
                <svg className="lp-ico" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
                </svg>
                <input
                  id="lp-password"
                  className="lp-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <div className="lp-error">
                <svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13">
                  <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a1 1 0 011 1v3a1 1 0 01-2 0V4a1 1 0 011-1zm0 8a1 1 0 100-2 1 1 0 000 2z"/>
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="lp-submit"
              disabled={loading || !username || !password}
            >
              {loading ? (
                <><span className="lp-spin" /> Authenticating…</>
              ) : (
                'Sign In →'
              )}
            </button>
          </form>

          <div className="lp-divider"><span>Quick demo</span></div>

          <div className="lp-demos">
            <button className="lp-demo-btn" type="button" onClick={() => fillDemo('patient1', 'pass1')}>
              <span className="lp-demo-role">Patient</span>
              <code className="lp-demo-cred">patient1 / pass1</code>
            </button>
            <button className="lp-demo-btn" type="button" onClick={() => fillDemo('D001', 'doctor1')}>
              <span className="lp-demo-role">Doctor</span>
              <code className="lp-demo-cred">D001 / doctor1</code>
            </button>
          </div>

          <p className="lp-footer">v2.0 · React 18 · Spring Boot 3 · Gemini AI</p>
        </div>
      </aside>
    </div>
  );
}
