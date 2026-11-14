import type { ReactNode } from 'react';
import styles from '../styles/Studio.module.css';

export function PageHeader({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader} data-page-header>
      <div className={styles.pageHeading}>
        <h1>{title}</h1>
        {detail}
      </div>
      {children && <div className={styles.pageActions}>{children}</div>}
    </header>
  );
}
