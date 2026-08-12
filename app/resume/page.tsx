import type { Metadata } from "next";

import { getRendererFixture } from "@/src/renderer/fixtures";
import { PublicResume } from "@/src/renderer/resume";

export const metadata: Metadata = {
  title: "Michael Sagar Vasandani — Public Résumé",
  description: "The complete accessible public résumé of AI and software engineer Michael Sagar Vasandani.",
  alternates: { canonical: "/resume" },
};

export default function ResumePage() {
  return (
    <>
      <a className="skip-link" href="#resume-content">Skip to résumé content</a>
      <PublicResume fixture={getRendererFixture("typical")} />
    </>
  );
}
