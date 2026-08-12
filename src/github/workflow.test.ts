import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("GitHub evidence workflow", () => {
  it("runs daily and manually with no granted GITHUB_TOKEN permissions", async () => {
    const workflow = await readFile(".github/workflows/collect-github-evidence.yml", "utf8");

    expect(workflow).toMatch(/^permissions:\s*\{\}\s*$/m);
    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).toMatch(/schedule:/);
    expect(workflow).toMatch(/cron:\s*["']17 9 \* \* \*["']/);
    expect(workflow).toContain("GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}");
    expect(workflow).not.toMatch(/permissions:\s*\n\s+contents:\s*read/);
    expect(workflow).not.toMatch(/PERSONAL_ACCESS_TOKEN|\bPAT\b|fine.grained/i);
    expect(workflow).toMatch(/target_environment:/);
    expect(workflow).toMatch(/type:\s*choice/);
    expect(workflow).toMatch(/options:\s*\n\s*- development\s*\n\s*- preview\s*\n\s*- production/);
    expect(workflow).toMatch(/environment:\s*\$\{\{\s*github\.event_name == 'schedule' && 'production' \|\| inputs\.target_environment\s*\}\}/);
  });
});
