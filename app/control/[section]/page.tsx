import { notFound } from "next/navigation";

import { readOperationalView, readOwnerControlContext } from "@/src/control/access.server";
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
  const context = await readOwnerControlContext();
  if (!context) notFound();

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
              {section === "publication-runs" ? (
                <form action="/api/control/commands" method="post">
                  <input type="hidden" name="csrfToken" value={context.csrfToken} />
                  <input type="hidden" name="action" value="retry" />
                  <input type="hidden" name="targetId" value={record.label} />
                  <button type="submit">Retry immutable run</button>
                </form>
              ) : null}
              {section === "restore-retry" ? (
                <form action="/api/control/commands" method="post">
                  <input type="hidden" name="csrfToken" value={context.csrfToken} />
                  <input type="hidden" name="action" value="restore" />
                  <input type="hidden" name="targetId" value={record.label} />
                  <label>
                    Exceptional restore reason
                    <input name="reason" minLength={8} required />
                  </label>
                  <button type="submit">Restore retained Valid deployment</button>
                </form>
              ) : null}
            </div>
          ))}
        </dl>
      )}
      {section === "breaker" && view.records.some(({ label, value }) => label === "State" && value === "open") ? (
        <form action="/api/control/commands" method="post">
          <input type="hidden" name="csrfToken" value={context.csrfToken} />
          <input type="hidden" name="action" value="clear-breaker" />
          <button type="submit">Run verified breaker clearance</button>
        </form>
      ) : null}
    </section>
  );
}
