import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ExportCard } from '../organisms/ExportCard';
import { useText } from '../lib/i18n';
import { QueryState } from '../molecules/QueryState';
import { PageHeader } from '../molecules/PageHeader';
import styles from '../styles/Studio.module.css';

export function Exports() {
  const text = useText();
  const query = useQuery({ queryKey: ['exports'], queryFn: api.exports });
  return (
    <div className={styles.page}>
      <PageHeader title={text.exports} />
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {!query.isPending && !query.error && !query.data?.length && (
        <div className={styles.empty}>
          <h2>{text.noExports}</h2>
          <p>{text.noExportsDetail}</p>
        </div>
      )}
      <div className={styles.exportGrid}>
        {query.data?.map((item) => (
          <ExportCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
