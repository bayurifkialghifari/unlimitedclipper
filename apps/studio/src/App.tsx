import { Component, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Button } from '@unlimitedclipper/ui';
import { api, request } from './lib/api';
import { useLanguage, useText } from './lib/i18n';
import { Shell } from './templates/Shell';
import { Studio } from './pages/Studio';
import { Projects } from './pages/Projects';
import { Exports } from './pages/Exports';
import { Jobs } from './pages/Jobs';
import { SettingsPage } from './pages/Settings';
import styles from './styles/Studio.module.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  render() {
    if (this.state.error) {
      return (
        <div className={styles.error} role="alert">
          {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}

async function bootstrap() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const token = hash.get('session');
  if (token) {
    await request('/session', { method: 'POST', body: JSON.stringify({ token }) });
    history.replaceState(null, '', location.pathname + location.search);
  }
  const settings = await api.settings();
  useLanguage.getState().setLanguage(settings.language === 'en' ? 'en' : 'id');
  return settings;
}

export function App() {
  const text = useText();
  const session = useQuery({ queryKey: ['session'], queryFn: bootstrap, retry: false });
  useEffect(() => {
    document.title = 'UnlimitedClipper';
  }, []);
  if (session.isPending) {
    return (
      <main className={styles.empty} role="status">
        {text.waiting}
      </main>
    );
  }
  if (session.error) {
    return (
      <main className={styles.empty}>
        <p className={styles.error} role="alert">
          {session.error.message}
        </p>
        <Button onClick={() => void session.refetch()}>{text.retry}</Button>
      </main>
    );
  }
  return (
    <ErrorBoundary>
      <Shell>
        <Routes>
          <Route path="/" element={<Studio />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/exports" element={<Exports />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </ErrorBoundary>
  );
}
