export const fixtureNames = [
  "sparse",
  "typical",
  "dense",
  "long-word",
  "optional-section",
  "six-pin",
] as const;

export type RendererFixtureName = (typeof fixtureNames)[number];

export type Contact = {
  kind: "email" | "github" | "linkedin";
  label: string;
  href: string;
};

export type Experience = {
  organization: string;
  title: string;
  location?: string;
  dates: string;
  bullets: readonly string[];
};

export type Education = {
  institution: string;
  degree: string;
  location?: string;
  dates: string;
  gpa?: string;
  coursework?: readonly string[];
  details?: readonly string[];
};

export type CareerProject = {
  name: string;
  technologies: readonly string[];
  repositoryHref?: string;
  bullets: readonly string[];
};

export type PortfolioProject = CareerProject & {
  description: string;
  repositoryHref: string;
  demonstrationHref?: string;
  aiRelevance?: number;
  repositoryMetadata?: {
    description?: string | null;
    language?: string | null;
    topics?: readonly string[];
    lastUpdated?: string | null;
    releaseCount?: number;
    pinned?: boolean;
  };
};

export type SkillGroup = {
  name: string;
  items: readonly string[];
};

export type OptionalSection = {
  heading: "Awards" | "Certifications" | "Publications" | "Volunteering";
  items: readonly string[];
};

export type RendererFixture = {
  fixture: RendererFixtureName;
  name: string;
  location?: string;
  role: string;
  cardProof: string;
  aboutLede: string;
  aboutBody: string;
  contacts: readonly Contact[];
  experience: readonly Experience[];
  education: readonly Education[];
  careerProjects: readonly CareerProject[];
  projects: readonly PortfolioProject[];
  skills: readonly SkillGroup[];
  optionalSections: readonly OptionalSection[];
  lastUpdated: string;
  manifestHash: `sha256:${string}`;
};

const contacts: readonly Contact[] = [
  {
    kind: "email",
    label: "Email Michael",
    href: "mailto:michaelvasandani6@gmail.com",
  },
  {
    kind: "github",
    label: "Michael Vasandani on GitHub",
    href: "https://github.com/Michaelvasandani",
  },
  {
    kind: "linkedin",
    label: "LinkedIn profile",
    href: "https://linkedin.com/in/michael-vasandani",
  },
];

const experience: readonly Experience[] = [
  {
    title: "AI Engineer Intern",
    organization: "ResMed",
    location: "San Diego, CA",
    dates: "June 2026 – Present",
    bullets: [
      "Cut bug-fix turnaround by 60% by engineering a production multi-agent Crashlytics remediation workflow with GitHub Agentic Workflows for automated investigation, fix generation, and human-in-the-loop validation.",
      "Enabled 40+ users to self-serve internal questions by building a LangChain/LangGraph AI investigation platform with MCP tools, RAG memory, a FastAPI REST API, and AWS CloudWatch/DynamoDB integrations.",
      "Increased internal AI adoption by 70% by launching a reusable agent marketplace with CI/CD validation and versioning.",
      "Saved 10+ developer hours weekly with an agentic workflow that detects documentation drift and opens pull requests.",
    ],
  },
  {
    title: "Software Engineer - AI Intern",
    organization: "Qualcomm Institute",
    location: "San Diego, CA",
    dates: "September 2025 – May 2026",
    bullets: [
      "Cut content authoring time by 85% with an LLM generation/compliance pipeline using FastAPI, MongoDB, and Ollama.",
      "Integrated the system into Unreal Engine via C++ components, enabling real-time API calls and bulk dialogue importing.",
      "Reduced token usage and processing time by 70% by implementing semantic retrieval over prior dialogue trees in MongoDB.",
    ],
  },
  {
    title: "Research Assistant",
    organization: "Smarr Lab",
    location: "San Diego, CA",
    dates: "April 2025 – May 2026",
    bullets: [
      "Built an AI knowledge base using Python, Codex, and Obsidian that transforms academic papers into knowledge graphs.",
      "Accelerated an ETL pipeline 7x for 700M+ rows by optimizing BigQuery SQL and leveraging Polars for parallel processing.",
    ],
  },
  {
    title: "Software Engineer Intern",
    organization: "Boost Health Labs",
    location: "San Diego, CA",
    dates: "June 2025 – September 2025",
    bullets: [
      "Increased website engagement by 45% by building Angular/TypeScript components and integrating REST services.",
      "Owned full-stack features from requirements through production by collaborating across product and development teams.",
    ],
  },
  {
    title: "Software Engineer Intern",
    organization: "TipTop Technologies",
    location: "Sunnyvale, CA",
    dates: "March 2025 – June 2025",
    bullets: [
      "Architected internal GitHub analytics tool on AWS Lambda and DynamoDB, cutting leadership review time by 90%.",
      "Engineered LLM pipeline with RAG and Pinecone embeddings for natural language codebase queries.",
    ],
  },
];

const education: readonly Education[] = [
  {
    institution: "University of California, San Diego - San Diego, CA",
    degree: "Bachelor of Science in Data Science - GPA: 3.82",
    dates: "June 2026",
    gpa: "3.82",
    coursework: [
      "Algorithms",
      "Object-Oriented Programming",
      "ML/AI",
      "Data Structures",
      "Databases",
      "Data Visualization",
    ],
  },
];

const careerProjects: readonly CareerProject[] = [
  {
    name: "Hackathon-In-A-Box",
    technologies: ["TypeScript", "Claude Agent SDK", "Node.js", "PostgreSQL"],
    repositoryHref: "https://github.com/Michaelvasandani/Hackathon-In-A-Box",
    bullets: [
      "Placed 2nd at the Claude Social Impact Hackathon by building an 8-phase agentic planning platform that generates source-verified venue, sponsor, and mentor recommendations.",
      "Drove adoption across 10+ nonprofits by conducting stakeholder and user interviews, translating feedback into product requirements, and iterating on the platform to match real-world planning workflows.",
    ],
  },
  {
    name: "SafeTrip SF",
    technologies: ["Python", "LangGraph", "Pydantic", "FastAPI", "PostgreSQL", "pgvector"],
    repositoryHref: "https://github.com/Michaelvasandani/SafeTrip-SF",
    bullets: [
      "Won the Musa Labs Hackathon by building a RAG-powered trip planner generating itineraries from safety data.",
      "Built with LangGraph, FastAPI, React, PostgreSQL, and pgvector using 10,000+ incidents across 41 neighborhoods.",
    ],
  },
  {
    name: "Personal Call Agent",
    technologies: ["TypeScript", "Vercel", "Google Calendar API", "Bland AI"],
    repositoryHref: "https://github.com/Michaelvasandani/Voice-Agent",
    bullets: [
      "Built a real-time AI voice agent that handles missed calls, checks availability, books meetings, and sends call summaries.",
      "Integrated Bland AI with Google Calendar for scheduling, with webhook verification and API contract testing via Vitest.",
    ],
  },
];

const descriptions = {
  hackathon: "An eight-phase planning platform grounds venue, sponsor, and mentor recommendations in sources while guiding nonprofit teams through a complete event workflow.",
  safeTrip: "A LangGraph trip planner grounds itineraries in 10,000-plus safety incidents across 41 San Francisco neighborhoods through PostgreSQL and pgvector retrieval.",
  voice: "A TypeScript voice agent verifies webhooks, checks calendar availability, books meetings, and returns summaries through tested API contracts.",
  clinical: "A clinical-trial discovery interface turns complex eligibility data into a clear, searchable workflow backed by tested TypeScript services.",
  closet: "A wardrobe application organizes clothing data and outfit decisions through an accessible interface and a maintainable typed application model.",
  keepingUp: "An AI research workspace helps readers follow fast-moving technical topics through source-linked summaries and structured retrieval workflows.",
} as const;

const portfolioProjects: readonly PortfolioProject[] = [
  { ...careerProjects[0]!, description: descriptions.hackathon, repositoryHref: careerProjects[0]!.repositoryHref! },
  { ...careerProjects[1]!, description: descriptions.safeTrip, repositoryHref: careerProjects[1]!.repositoryHref! },
  { ...careerProjects[2]!, description: descriptions.voice, repositoryHref: careerProjects[2]!.repositoryHref! },
];

const skills: readonly SkillGroup[] = [
  { name: "Languages", items: ["Java", "Python", "C++", "SQL", "JavaScript", "TypeScript", "HTML/CSS", "R"] },
  { name: "Frameworks", items: ["React", "Node.js", "Angular", "Material-UI", "FastAPI"] },
  { name: "Tools & Cloud", items: ["Git", "GitHub Actions", "Docker", "Kubernetes", "AWS", "GCP", "LangGraph", "Ollama", "Pinecone", "pgvector"] },
  { name: "Libraries", items: ["pandas", "NumPy", "scikit-learn", "PyTorch", "TensorFlow", "LangChain", "Hugging Face Transformers", "Pydantic"] },
];

const base: Omit<RendererFixture, "fixture"> = {
  name: "Michael Sagar Vasandani",
  location: "San Diego, California",
  role: "AI Engineer & Software Builder",
  cardProof: "I build source-grounded agentic systems that turn ambiguous work into dependable tools, measurable outcomes, and maintainable software.",
  aboutLede: "I build practical AI systems at the seam between software engineering, product judgment, and reliable automation.",
  aboutBody: "My recent work spans multi-agent remediation, investigation platforms, retrieval systems, developer tooling, and large-scale data pipelines. I make ambitious automation legible, measurable, and safe enough to earn its place in production.",
  contacts,
  experience,
  education,
  careerProjects,
  projects: portfolioProjects,
  skills,
  optionalSections: [],
  lastUpdated: "2026-08-12T00:00:00.000Z",
  manifestHash: `sha256:${"3".repeat(64)}`,
};

const extraProjects: readonly PortfolioProject[] = [
  {
    name: "clinical-trial-finder",
    technologies: ["TypeScript", "Next.js", "PostgreSQL"],
    repositoryHref: "https://github.com/Michaelvasandani/clinical-trial-finder",
    description: descriptions.clinical,
    bullets: [],
  },
  {
    name: "ClosetOS",
    technologies: ["TypeScript", "React", "Node.js"],
    repositoryHref: "https://github.com/Michaelvasandani/ClosetOS",
    description: descriptions.closet,
    bullets: [],
  },
  {
    name: "Keeping-Up-AI",
    technologies: ["Python", "Retrieval", "LLM"],
    repositoryHref: "https://github.com/Michaelvasandani/Keeping-Up-AI",
    description: descriptions.keepingUp,
    bullets: [],
  },
];

const optionalSections: readonly OptionalSection[] = [
  { heading: "Awards", items: ["Second Place, Claude Social Impact Hackathon", "Winner, Musa Labs Hackathon"] },
  { heading: "Certifications", items: ["AWS Certified Cloud Practitioner"] },
  { heading: "Publications", items: ["Reliable evidence graphs for agentic publication systems — engineering note, 2026"] },
  { heading: "Volunteering", items: ["Mentor, student AI engineering workshop series"] },
];

const fixtures: Record<RendererFixtureName, RendererFixture> = {
  sparse: {
    ...base,
    fixture: "sparse",
    role: "Software & Data Engineer",
    experience: [
      {
        title: "Software Engineer",
        organization: "Example Systems",
        dates: "2026 – Present",
        bullets: ["Built dependable software from validated requirements."],
      },
    ],
    education: [],
    careerProjects: [],
    projects: portfolioProjects,
    skills: [],
  },
  typical: { ...base, fixture: "typical" },
  dense: {
    ...base,
    fixture: "dense",
    experience: [
      ...experience,
      {
        title: "Publication Systems Engineer",
        organization: "Fixture Laboratory",
        location: "Remote",
        dates: "January 2024 – February 2025",
        bullets: [
          "Designed a deterministic publication verifier that compares every rendered field against immutable evidence before promotion.",
          "Documented recovery behavior across retries, provider timeouts, and last-valid deployment restoration without hiding operational failures.",
        ],
      },
    ],
    projects: [...portfolioProjects, ...extraProjects],
    optionalSections,
  },
  "long-word": {
    ...base,
    fixture: "long-word",
    projects: [
      {
        ...portfolioProjects[0]!,
        name: "publication-manifest-content-addressed-supercalifragilisticexpialidocious-validator",
        repositoryHref: `https://github.com/Michaelvasandani/${"content-addressed-publication-boundary-".repeat(4)}`,
        technologies: ["TypeScript", "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
      },
      ...portfolioProjects.slice(1),
    ],
  },
  "optional-section": { ...base, fixture: "optional-section", optionalSections },
  "six-pin": { ...base, fixture: "six-pin", projects: [...portfolioProjects, ...extraProjects] },
};

export function getRendererFixture(name: RendererFixtureName = "typical"): RendererFixture {
  return fixtures[name];
}

export function isRendererFixtureName(value: string): value is RendererFixtureName {
  return fixtureNames.some((name) => name === value);
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function validateRendererFixture(fixture: RendererFixture): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const proofWords = wordCount(fixture.cardProof);
  const aboutWords = wordCount(`${fixture.aboutLede} ${fixture.aboutBody}`);

  if (proofWords < 15 || proofWords > 25) errors.push("Card proof must contain 15–25 words.");
  if (aboutWords > 100) errors.push("About copy must contain no more than 100 words.");
  if (fixture.contacts.map(({ kind }) => kind).join(",") !== "email,github,linkedin") {
    errors.push("Contacts must contain Email, GitHub, and LinkedIn in source order.");
  }

  for (const project of fixture.projects) {
    const words = wordCount(project.description);
    if (words < 12 || words > 30) errors.push(`${project.name} description must contain 12–30 words.`);
    if (!/^https:\/\/github\.com\//.test(project.repositoryHref)) errors.push(`${project.name} requires an HTTPS GitHub link.`);
  }

  if (!/^sha256:[a-f0-9]{64}$/.test(fixture.manifestHash)) errors.push("Manifest hash must be a public SHA-256 digest.");

  return { valid: errors.length === 0, errors };
}
