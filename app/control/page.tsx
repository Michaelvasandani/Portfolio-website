import { notFound } from "next/navigation";

import { readOperationalView } from "@/src/control/access.server";
import { operationalSections, type OperationalShellView } from "@/src/control/operations";

import styles from "./control.module.css";

export default async function ControlPage() {
  const views = await Promise.all(operationalSections.map(({ slug }) => readOperationalView(slug)));
  if (views.some((view) => view === null)) notFound();
  const authenticatedViews = views as OperationalShellView[];

  return (
    <section aria-labelledby="operations-heading">
      <p className={styles.eyebrow}>Overview</p>
      <h1 id="operations-heading">Operational state</h1>
      <p>These surfaces report only recorded state. An unavailable or empty surface is not a successful operation.</p>
      <div className={styles.grid}>
        {authenticatedViews.map((view) => (
          <article className={styles.stateCard} key={view.slug}>
            <h2>{view.label}</h2>
            <p className={styles.state}>{view.state}</p>
            <p>{view.summary}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
