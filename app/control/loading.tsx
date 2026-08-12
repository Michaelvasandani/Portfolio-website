import styles from "./control.module.css";

export default function Loading() {
  return (
    <section aria-busy="true" aria-live="polite">
      <p className={styles.eyebrow}>Loading</p>
      <h1>Reading recorded state…</h1>
      <p>No success is assumed while state is loading.</p>
    </section>
  );
}
