"use client";

import styles from "./control.module.css";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section role="alert">
      <p className={styles.eyebrow}>Error</p>
      <h1>Operational state is unavailable</h1>
      <p>No success is assumed. Private diagnostic detail remains server-side.</p>
      <button type="button" onClick={() => retry()}>Try again</button>
    </section>
  );
}
