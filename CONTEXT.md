# Agentic Portfolio

This context defines the public portfolio and the content-maintenance system that keeps it current for AI and software engineering hiring teams.

## Language

**Portfolio**:
The public website that presents Michael's background, selected work, résumé, and professional links to AI and software engineering hiring teams.
_Avoid_: Personal site, profile page

**Autonomous update**:
A portfolio change derived from an external source, validated, published, and deployed without routine human approval, including generated narrative copy when appropriate.
_Avoid_: Suggested update, review-gated update

**Source authority**:
The designated owner of a category of Portfolio facts: the Career snapshot for experience and education, and GitHub for repository facts and project activity.
_Avoid_: Source of truth

**Résumé upload**:
A Markdown, DOCX, or text-based PDF supplied through Michael's authenticated private interface as the complete replacement source for experience and education.
_Avoid_: LinkedIn sync, résumé edit

**Career snapshot**:
The sanitized, structured experience and education data produced from a valid Résumé upload and retained as the career Source authority after the raw file is deleted.
_Avoid_: Parsed résumé, uploaded résumé

**Presentation policy**:
The repository-owned rules governing which externally sourced facts appear and how they may be presented when automation alone cannot infer intent safely.
_Avoid_: Manual portfolio update, content override

**Card view**:
The opening viewport of the Portfolio: a restrained, business-card-inspired introduction that gives way to more detailed editorial content after the first scroll.
_Avoid_: Home page, hero page

**Portfolio project**:
A public project selected autonomously from GitHub using repository quality, originality, relevance, recency, pins, and résumé evidence; forks, archives, and context-poor experiments are ineligible.
_Avoid_: Repository, featured repo

**Project evidence**:
Public, attributable facts that establish a project's identity, purpose, substance, and presentable claims, drawn from GitHub and, for a confidently matched project, the Career snapshot.
_Avoid_: Repo signals, project metadata

**Résumé project match**:
A high-confidence identity link between a project in the Career snapshot and a public GitHub repository, established by a direct repository link or by a clear name relationship with corroborating project facts.
_Avoid_: Fuzzy match, likely repo

**Material project change**:
A change in project eligibility, explicit editorial evidence, or relative strength large and durable enough to alter the Portfolio's selected projects, ordering, or claims.
_Avoid_: Any repository update, score drift

**Last valid portfolio**:
The most recent portfolio version that passed all publication checks and remains publicly available when a source or update fails validation.
_Avoid_: Stale site, fallback build
