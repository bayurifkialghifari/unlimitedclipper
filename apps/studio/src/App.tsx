import { Component, Suspense, lazy, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Button } from '@unlimitedclipper/ui';
import { api, request } from './lib/api';
import { useLanguage, useText } from './lib/i18n';
import { Shell } from './templates/Shell';
import styles from './styles/Studio.module.css';
import { isAndroidHost } from './lib/native';

const Studio = lazy(async () => {
  return { default: (await import('./pages/Studio')).Studio };
});
const Projects = lazy(async () => {
  return { default: (await import('./pages/Projects')).Projects };
});
const ProjectDetail = lazy(async () => {
  return { default: (await import('./pages/ProjectDetail')).ProjectDetail };
});
const ManualClip = lazy(async () => {
  return { default: (await import('./pages/ManualClip')).ManualClip };
});
const Exports = lazy(async () => {
  return { default: (await import('./pages/Exports')).Exports };
});
const Jobs = lazy(async () => {
  return { default: (await import('./pages/Jobs')).Jobs };
});
const SettingsPage = lazy(async () => {
  return { default: (await import('./pages/Settings')).SettingsPage };
});

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
  const nativeStarting = isAndroidHost() && location.hostname !== '127.0.0.1';
  const session = useQuery({
    queryKey: ['session'],
    queryFn: bootstrap,
    retry: false,
    enabled: !nativeStarting,
  });
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
        <Suspense fallback={<p role="status">{text.waiting}</p>}>
          <Routes>
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:projectId" element={<ProjectDetail />} />
            <Route path="/projects/:projectId/manual" element={<ManualClip />} />
            <Route path="/studio/:clipId" element={<Studio />} />
            <Route path="/exports" element={<Exports />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Shell>
    </ErrorBoundary>
  );
}
