import type { Metadata } from "next";
import Link from "next/link";

import styles from "./owner-access.module.css";

export const metadata: Metadata = {
  title: "Owner access",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function OwnerAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="owner-access-heading">
        <p className={styles.eyebrow}>Private control plane</p>
        <h1 id="owner-access-heading">Owner access</h1>
        <p>Authentication is restricted to the configured immutable GitHub identity.</p>
        {status === "denied" ? <p role="alert">Owner access could not be verified.</p> : null}
        {status === "logged-out" ? <p role="status">The private session ended.</p> : null}
        <a className={styles.action} href="/api/auth/github/start">
          Continue with GitHub
        </a>
        <Link href="/">Return to the public portfolio</Link>
      </section>
    </main>
  );
}
