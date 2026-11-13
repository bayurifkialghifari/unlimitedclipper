import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ExportDownload } from '../organisms/ExportDownload';
import { useText } from '../lib/i18n';
import { date } from '../lib/format';
import { QueryState } from '../molecules/QueryState';
import styles from '../styles/Studio.module.css';

export function Exports() {
  const text = useText();
  const query = useQuery({ queryKey: ['exports'], queryFn: api.exports });
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{text.exports}</h1>
      </header>
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
      <div className={styles.list}>
        {query.data?.map((item) => (
          <article className={styles.listItem} key={item.id}>
            <h2>{item.name}</h2>
            <p>
              {date(item.created_at)} · rev. {item.revision}
            </p>
            <div className={styles.headerActions}>
              <ExportDownload assetId={item.asset_id} label="MP4" />
              <ExportDownload assetId={item.srt_asset_id} label="SRT" />
              <ExportDownload assetId={item.ass_asset_id} label="ASS" />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
