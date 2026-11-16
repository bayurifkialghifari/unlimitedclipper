import { useEffect, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  FilmStripIcon,
  FolderIcon,
  DownloadSimpleIcon,
  QueueIcon,
  GearIcon,
} from '@phosphor-icons/react';
import { useAutosave, useEngineEvents } from '../hooks/use-engine';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import styles from '../styles/Studio.module.css';
import { UpdateNotice } from '../organisms/UpdateNotice';
import { isAndroidHost } from '../lib/native';
import { ActivityCenter } from '../organisms/ActivityCenter';
import { AppIcon } from '../atoms/AppIcon';

export function Shell({ children }: { children: ReactNode }) {
  const text = useText();
  const clipId = useEditor((state) => state.clipId);
  useEngineEvents();
  useAutosave();
  useEffect(() => {
    function protect(event: BeforeUnloadEvent) {
      if (useEditor.getState().dirty || useEditor.getState().saving) {
        event.preventDefault();
      }
    }
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, []);
  const links = [
    ...(clipId ? [{ to: '/studio/' + clipId, label: text.studio, icon: FilmStripIcon }] : []),
    { to: '/projects', label: text.library, icon: FolderIcon },
    { to: '/exports', label: text.exports, icon: DownloadSimpleIcon },
    { to: '/jobs', label: text.jobs, icon: QueueIcon },
    { to: '/settings', label: text.settings, icon: GearIcon },
  ];
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <AppIcon className={styles.wordmark} />
        <nav className={styles.nav} aria-label={text.studio}>
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to !== '/projects'}
              className={({ isActive }) =>
                styles.navLink + (isActive ? ' ' + styles.navActive : '')
              }
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className={styles.main}>
        {isAndroidHost() ? (
          <aside className={styles.platformNotice} aria-label={text.androidUntested}>
            <strong>{text.androidUntested}</strong>
            <p>{text.androidScope}</p>
          </aside>
        ) : (
          <UpdateNotice />
        )}
        <ActivityCenter />
        {children}
      </main>
    </div>
  );
}
