import { notFound } from "next/navigation";

import { readOperationalView } from "@/src/control/access.server";
import { isOperationalSection } from "@/src/control/operations";

import styles from "../control.module.css";

export default async function OperationalSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!isOperationalSection(section)) notFound();
  const view = await readOperationalView(section);
  if (!view) notFound();

  return (
    <section aria-labelledby="operational-section-heading">
      <p className={styles.eyebrow}>Operational state</p>
      <h1 id="operational-section-heading">{view.label}</h1>
      <p className={styles.state}>{view.state}</p>
      <p>{view.summary}</p>
      {view.records.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>No records to report</h2>
          <p>No completed or successful work is inferred from this state.</p>
        </div>
      ) : (
        <dl>
          {view.records.map((record) => (
            <div key={record.label}>
              <dt>{record.label}</dt>
              <dd>{record.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
