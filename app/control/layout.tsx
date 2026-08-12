import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { readOwnerControlContext } from "@/src/control/access.server";
import { operationalSections } from "@/src/control/operations";

import styles from "./control.module.css";

export const metadata: Metadata = {
  title: "Portfolio operations",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function ControlLayout({ children }: { children: ReactNode }) {
  const context = await readOwnerControlContext();
  if (!context) notFound();

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Private control plane</p>
          <Link href="/control" className={styles.title}>Portfolio operations</Link>
        </div>
        <form action="/api/auth/logout" method="post">
          <input type="hidden" name="csrfToken" value={context.csrfToken} />
          <button type="submit">Log out</button>
        </form>
      </header>
      <div className={styles.frame}>
        <nav aria-label="Operational sections" className={styles.navigation}>
          <ul>
            {operationalSections.map((section) => (
              <li key={section.slug}>
                <Link href={`/control/${section.slug}`}>{section.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.content}>{children}</div>
      </div>
    </main>
  );
}
