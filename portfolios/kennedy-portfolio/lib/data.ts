export const profile = {
  name: "Kennedy Mwanzia",
  role: "Software & AI/ML Engineer, Distributed Systems & SaaS",
  focus: "Software and AI/ML engineering, distributed systems, multi-tenant SaaS, retrieval and evaluation",
  location: "Remote, worldwide",
  email: "kennedymwanzia001@gmail.com",
  phone: "+254 796 516 595",
  github: "https://github.com/kennie-afk",
  summary:
    "I build production systems end to end, back end to front end: microservice platforms where each service owns its database, multi-tenant SaaS with isolation enforced below the application, double-entry ledgers with idempotent replay, sagas that unwind in reverse, and a transactional outbox closing the window between commit and publish.",
  secondary:
    "On top of that I build the AI and machine learning parts most teams buy in: an HNSW index written from the paper, two-tower retrieval, a calibrated ranker, and the experiment machinery that says whether any of it actually helped.",
};

// Every figure below is counted from the repository it describes. The method is
// recorded alongside it so the number can be re-derived rather than trusted.
export const headline = [
  {
    value: "35",
    label: "Microservices across two platforms",
    method: "26 in SmartSeason, 9 in SmartRE, one database each",
  },
  {
    value: "2,484",
    label: "Tests across nine systems",
    method: "Passing tests from each runner; HMS, SmartSeason, Church CMS and Soko re-measured 3 Oct 2026, the rest 2 Oct; skipped database-gated tests not counted",
  },
  {
    value: "9",
    label: "Systems built and runnable",
    method: "Each with a test suite and docker compose; Mara is partial by design and HMS has no live payer or payment connection; none has real users yet",
  },
  {
    value: "10.7 ms",
    label: "p95 serving latency, ranked feed",
    method: "400 requests, 4-core laptop, Sifa README",
  },
];

export const evidenceNote =
  "Test counts are passing tests from each project's own runner (pytest, vitest, Maven surefire), re-measured on 2 October 2026 (HMS, SmartSeason, Church CMS and Soko again on 3 October); tests that need an external database and were skipped are not counted. Service counts come from the build files. Latency and accuracy come from the benchmark documented in that project's own README. Mara is partial by design and HMS has no live payer or payment connection; each says what it does not build. Nothing here is rounded up and no system has real users yet.";

export const resume = {
  // The download name is set explicitly so it does not land in someone's
  // downloads folder as "cv".
  href: "/Kennedy_Mwanzia_Resume.pdf",
  filename: "Kennedy_Mwanzia_Resume.pdf",
  size: "108 KB",
  updated: "September 2026",
  pages: 4,
};

export const capabilities = [
  {
    index: "01",
    title: "Distributed systems and SaaS",
    body: "Database-per-service behind a gateway doing JWT pre-verification, circuit breaking and Redis rate limiting. Double-entry ledgers with idempotent replay, sagas whose compensation unwinds in reverse, and a transactional outbox that closes the crash window between commit and publish.",
    tags: ["Microservices", "Event-driven", "Multi-tenancy", "Sagas"],
  },
  {
    index: "02",
    title: "Full-stack product engineering",
    body: "Next.js front ends over Java, Node and Python services. Component and state design, API contracts, relational modelling and the integration between the layers rather than one side of it, with Playwright and vitest covering the paths that matter.",
    tags: ["Next.js", "React", "Spring Boot", "FastAPI"],
  },
  {
    index: "03",
    title: "Machine learning systems",
    body: "Two-tower retrieval trained with sampled softmax over in-batch negatives, an HNSW index implemented from the paper, and a gradient-boosted ranker with Platt scaling so a score is a probability rather than an ordering. Point-in-time feature stores that refuse to read a value recorded after the request they serve.",
    tags: ["Two-tower retrieval", "HNSW", "Calibration", "Feature stores"],
  },
  {
    index: "04",
    title: "Experimentation and statistics",
    body: "A mixture SPRT that stops early without inflating alpha, validated over 300 simulated A/A runs with repeated peeking. Thompson sampling with decay, hash-bucketed assignment, PSI and Kolmogorov-Smirnov drift detection, and four-fifths-rule adverse impact testing that returns insufficient data rather than a false pass.",
    tags: ["Sequential testing", "Bandits", "Drift detection", "Bias testing"],
  },
  {
    index: "05",
    title: "AI evaluation and benchmarking",
    body: "Self-contained benchmark bundles for AfterQuery's Frontier Bench: instruction, Dockerised environment, reference solution and a sealed verifier the candidate's code never runs in. Validated by adversarial arms rather than assertion, with worlds redrawn from a system-random seed so no answer can be precomputed.",
    tags: ["Frontier Bench", "Tamper-resistant graders", "Adversarial validation"],
  },
  {
    index: "06",
    title: "Teaching and mentoring",
    body: "Full-stack engineering training across Java and Spring Boot, React, Node.js and Laravel, plus architecture and code review with written technical rationale. I also teach robotics, working with ZMRobo kits.",
    tags: ["Instruction", "Code review", "Robotics"],
  },
];

export const experience = [
  {
    role: "Software Engineer & Software Instructor",
    org: "Techsavanna Company",
    period: "Aug 2025 to Present",
    points: [
      "Design and ship backend systems that hold under load: service boundaries that stay stable as the domain moves, database-per-service ownership, and asynchronous messaging where a synchronous call would have coupled two teams together.",
      "Build multi-tenant SaaS with tenant isolation enforced below the application, at the framework and the database, so a missing filter in one query cannot leak another customer's data.",
      "Make write paths safe to retry: idempotency keys on every externally triggered mutation, a transactional outbox closing the window between commit and publish, and compensation that unwinds a failed saga in reverse.",
      "Take services to production and keep them there: staged rollout, health and latency metrics that gate a release, and rollback as one call rather than a redeployment.",
      "Lead architecture and code review with written rationale covering correctness, production cost and the recommended alternative.",
    ],
  },
  {
    role: "AI Benchmark & Verifier Engineer",
    org: "AfterQuery (Frontier Bench / Kepler)",
    period: "2026 to Present",
    points: [
      "Author self-contained benchmark bundles evaluating frontier AI agents on realistic software, ML and systems engineering work.",
      "Build deterministic, tamper-resistant graders: root-authoritative grading in a process the candidate's code never runs in, with sealed reference data unreadable to the agent.",
      "Validate by adversarial arms rather than assertion: for every task, the arms that should fail and the arms that should pass. Recent bundle: 11 arms, oracle 1.000, every bypass 0.000.",
    ],
  },
  {
    role: "Architect and Engineer",
    org: "SmartRE, a Real-Estate Trust Platform",
    period: "2026 to Present",
    points: [
      "Built a real-estate trust platform end to end: nine Spring Boot microservices behind a Spring Cloud Gateway, each owning its own database behind PgBouncer, with state moving between services as Kafka events.",
      "Treated payments as a reliability-critical subsystem: M-Pesa escrow with idempotency keys, distributed locking and reconciliation on late callbacks, with the gateway failing closed when Redis is unreachable.",
    ],
  },
  {
    role: "Architect and Engineer",
    org: "Aegis, a Self-Governing HR Automation Platform",
    period: "2026 to Present",
    points: [
      "Built supervised attrition modelling behind a governance gate: determinism probing, drift detection and adverse-impact testing combine into a PASS/WARN/BLOCK verdict that weighs self-contradiction above input movement.",
      "Put every decision through a hash-chained audit ledger that can be verified after the fact, with candidate screening checked against the four-fifths rule.",
    ],
  },
  {
    role: "Architect and Engineer",
    org: "SmartSeason, an Agricultural Operations Platform",
    period: "2026 to Present",
    points: [
      "Built a 26-service agricultural operations platform, database-per-service behind a gateway, with the service tree generated from a single catalogue so every service shares the same security, persistence and observability shape. Regenerating the tree produces no diff, and all 26 services build and pass their tests.",
      "Built five fraud detectors that consume attendance events over Kafka and open evidence-backed cases whose confidences compound probabilistically, standardising errors as RFC 7807 problem documents across every service.",
    ],
  },
  {
    role: "Architect and Engineer",
    org: "Sifa, a Retrieval & Ranking Platform",
    period: "2026 to Present",
    points: [
      "Built a personalised feed without buying a vector database, a feature platform or a managed experiment service: two-tower retrieval over an HNSW index written from the paper, with a Platt-calibrated ranker on top.",
      "Measured rather than claimed: 10.7 ms p95 latency over 400 requests, 0.973 held-out AUC, and recall@10 climbing from 0.820 to 1.000 as the index's ef_search widens, including where the index loses to brute force, stated rather than hidden.",
    ],
  },
  {
    role: "Architect and Engineer",
    org: "Mara, a Multi-Tenant POS Platform",
    period: "2026 to Present",
    points: [
      "Building a point-of-sale platform for retail and hospitality, built around a real CAP tradeoff: the till has to stay available under a network partition while the ledger and the tax record it feeds stay consistent.",
      "Shipped three Spring Boot services and an offline-first till: identity and enrolment, a sync service that keeps a verified append-only second copy of every terminal's journal, and a core service posting a double-entry ledger with disjoint fiscal-number leases. The sale encoding is pinned in both directions between the till's TypeScript and the server's Java. Not built: the gateway, catalogue and stock, and a back-office UI.",
    ],
  },
  {
    role: "Architect and Engineer",
    org: "HMS, a Health Management System for Kenya",
    period: "2026 to Present",
    points: [
      "Built a multi-facility health management system as a modular monolith: fifteen backend modules covering patient registry, scheduling, clinical, pharmacy, laboratory, imaging, billing, claims readiness, inpatient, maternal and child health, disease programmes, reporting, a FHIR R4 read interface and a patient portal, with tenant isolation enforced by PostgreSQL row-level security and a hash-chained audit trail written in the same transaction as each change.",
      "Encoded safety rules in the database rather than the UI: double booking blocked by exclusion constraints, invoice lines frozen by trigger once issued, four-eyes validation of lab results, and a controlled-drug dispense that needs a different witness. 101 backend tests run against a real PostgreSQL, and the offline bedside capture was checked in headless Chrome.",
      "Not claimed: M-Pesa is simulated and SHA/DHA claim submission is an unverified stub that sends nothing, so no payer connection exists. The DHIS2 export has not been sent to a DHIS2 server, the FHIR output has not been run through the HL7 validator, and the official MOH returns and DICOM imaging are not built.",
    ],
  },
  {
    role: "Architect and Engineer",
    org: "Forecourt, Revenue Assurance for Car Washes",
    period: "2026 to Present",
    points: [
      "Built a revenue-assurance system reconciling three independent ledgers, demand, work and money, each witnessed by at least two sources and at least one that is not a human, so the product is the discrepancy itself, not the records.",
      "Ran telemetry as its own service, deliberately outside the operator's control, because the meter must not be forgeable by the person being audited, with row-level security enforced per tenant.",
    ],
  },
  {
    role: "Architect and Engineer",
    org: "Soko, Farm Produce Dropshipping",
    period: "2026 to Present",
    points: [
      "Built a dropshipping platform for perishable dairy and farm produce, where the routing engine refuses a supplier whose lead time meets or exceeds a product's shelf life: fresh milk at 48 hours rejects a supplier 30 hours away even when it is cheapest.",
      "Shipped separate interfaces for shoppers, suppliers and operations across 21 console routes, with every rejection carrying its reason, a simulated-by-default M-Pesa STK push, a plan-based commission layer, and rate limiting on sign-in.",
    ],
  },
  {
    role: "Full-Stack Software Developer",
    org: "Techsavanna Software",
    period: "May to Aug 2025",
    points: [
      "Built a multi-tenant membership and content platform end to end in TypeScript and Express over Sequelize and PostgreSQL, with a React front end.",
      "86 backend modules across 12 domains, tenancy enforced at the repository layer, per-module Zod validation and JWT authentication.",
    ],
  },
];

export const projects = [
  {
    id: 1,
    slug: "sifa",
    lang: "Python",
    tests: "217",
    domain: "Retrieval & ranking",
    title: "Sifa",
    subtitle: "Retrieval, ranking and experimentation",
    scale: "Python · 47 modules",
    description:
      "A personalised feed built without a vector database, a feature platform or a managed experiment service. The parts that are usually bought are implemented here and measured, including where the index loses to brute force, which the README states rather than hides.",
    metrics: [
      { value: "217", label: "tests" },
      { value: "10.7 ms", label: "p95 latency" },
      { value: "0.973", label: "held-out AUC" },
      { value: "0.820→1.000", label: "recall@10" },
    ],
    tech: ["Python", "FastAPI", "NumPy", "scikit-learn", "HNSW", "Next.js"],
    image: "/images/sifa.jpg",
    github: "https://github.com/kennie-afk/python.0/tree/main/sifa",
  },
  {
    id: 2,
    slug: "aegis",
    lang: "Python",
    tests: "390",
    domain: "ML governance",
    title: "Aegis",
    subtitle: "Self-governing HR automation",
    scale: "Python · 77 modules",
    description:
      "Supervised attrition modelling behind a governance gate. Determinism probing, drift detection and adverse-impact testing combine into a PASS/WARN/BLOCK verdict that weighs self-contradiction above input movement. Every decision lands in a ledger that can be verified after the fact.",
    metrics: [
      { value: "390", label: "tests" },
      { value: "4/5ths", label: "adverse impact" },
      { value: "chained", label: "audit ledger" },
    ],
    tech: ["Python", "FastAPI", "scikit-learn", "SciPy", "PostgreSQL", "Next.js"],
    image: "/images/aegis.jpg",
    github: "https://github.com/kennie-afk/python.0/tree/main/aegis",
  },
  {
    id: 3,
    slug: "smartseason",
    lang: "Java 21",
    tests: "591",
    domain: "Agri operations",
    title: "SmartSeason",
    subtitle: "Agricultural operations platform",
    scale: "Java · 1,771 sources",
    description:
      "Twenty-six bounded contexts, database-per-service behind a gateway, generated from a single catalogue so regenerating the tree produces no diff. Five fraud detectors consume attendance events over Kafka and open evidence-backed cases whose confidences compound probabilistically. Task start and stop are timed on the server's clock and written through an audit outbox. Errors are RFC 7807 problem documents across every service. List endpoints filter and sort on the server through one shared specification filter, so the console never fetches everything to filter in the browser.",
    metrics: [
      { value: "26", label: "services" },
      { value: "591", label: "tests" },
      { value: "1,771", label: "Java sources" },
    ],
    tech: ["Java 21", "Spring Boot 3", "Kafka", "PostgreSQL", "Redis", "Next.js"],
    image: "/images/smartseason.jpg",
    github: "https://github.com/kennie-afk/java.0/tree/main/smartSeason",
  },
  {
    id: 4,
    slug: "smartre",
    lang: "Java 21",
    tests: "581",
    domain: "Real estate",
    title: "SmartRE",
    subtitle: "Real-estate trust platform",
    scale: "Java · 538 sources",
    description:
      "Nine Spring Boot microservices, each with its own database behind PgBouncer. Payments treated as a reliability-critical subsystem: M-Pesa escrow with idempotency keys, distributed locking and reconciliation on late callbacks. The gateway fails closed when Redis is unreachable. A GET to a POST-only path now returns 405 with an Allow header in every service, verified live through the gateway.",
    metrics: [
      { value: "9", label: "services" },
      { value: "581", label: "tests" },
      { value: "16", label: "Playwright tests" },
    ],
    tech: ["Java 21", "Spring Boot 3", "PgBouncer", "Kubernetes", "Next.js 14", "Playwright"],
    image: "/images/smartre.jpg",
    github: "https://github.com/kennie-afk/java.0/tree/main/smartRE",
  },
  {
    id: 5,
    slug: "forecourt",
    lang: "TypeScript",
    tests: "63",
    domain: "Revenue assurance",
    title: "Forecourt",
    subtitle: "Revenue assurance for car washes",
    scale: "TypeScript · 70 sources",
    description:
      "Three independent ledgers reconciled for demand, work and money, each witnessed by at least two sources and at least one that is not a human. The product is the discrepancy between records, not the records. Telemetry runs as its own service because the meter must not be forgeable by the person being audited. It now has a public landing page, a pricing page and a signup intake form; signup records a request and does not provision an account.",
    metrics: [
      { value: "63", label: "tests, passing" },
      { value: "8", label: "migrations" },
      { value: "RLS", label: "per tenant" },
    ],
    tech: ["TypeScript", "Express", "PostgreSQL", "Zod", "M-Pesa Daraja", "Next.js"],
    image: "/images/forecourt.jpg",
    github: "https://github.com/kennie-afk/node.0/tree/main/projects/carwash",
  },
  {
    id: 6,
    slug: "church-cms",
    lang: "TypeScript",
    tests: "352",
    domain: "Congregations",
    title: "Church CMS",
    subtitle: "Multi-tenant congregation management",
    scale: "TypeScript · 562 sources",
    description:
      "Members, families, ministries, small groups, events, sermons, attendance, giving and a finance ledger, with every query scoped to the signed-in congregation by row-level security so one deployment serves many churches without them seeing each other. Each church defines its own roles, and permissions are resolved per request from the database rather than baked into the code or the token. Gift receipts print or download as PDF, the dashboard shows only what the signed-in role may see, and the interface has light and dark themes.",
    metrics: [
      { value: "352", label: "tests passing" },
      { value: "per church", label: "custom roles" },
      { value: "RLS", label: "per tenant" },
    ],
    tech: ["TypeScript", "Express", "Sequelize", "PostgreSQL", "React"],
    image: "/images/church-cms.jpg",
    github: "https://github.com/kennie-afk/node.0/tree/main/projects/cms",
  },
  {
    id: 7,
    slug: "soko",
    lang: "Java 21",
    tests: "33",
    domain: "Dropshipping",
    title: "Soko",
    subtitle: "Farm produce dropshipping",
    scale: "Java · 77 sources",
    description:
      "The hard part of dairy dropshipping is not the marketplace, it is that the goods spoil. The routing engine refuses a supplier whose lead time meets or exceeds the product's shelf life: fresh milk at 48 hours rejects a supplier 30 hours away even when it is cheapest. Every rejection carries its reason, every list endpoint is paginated server-side, and CORS is a configurable allowlist rather than a wildcard. Orders can be cancelled with stock restored, wastage is tracked, and platform revenue comes from three plans with a falling commission (5.0%, 3.5% and 2.0%), a starting point not yet tested against paying tenants. M-Pesa STK push is simulated by default; sign-in is rate limited.",
    metrics: [
      { value: "48 h", label: "shelf-life gate" },
      { value: "21", label: "console routes" },
      { value: "33", label: "tests" },
    ],
    tech: ["Java 21", "Spring Boot 3", "PostgreSQL", "Next.js", "Tailwind"],
    image: "/images/soko.jpg",
    github: "https://github.com/kennie-afk/java.0/tree/main/soko",
  },
  {
    id: 8,
    slug: "mara",
    lang: "Java 21",
    tests: "156",
    domain: "Point of sale",
    title: "Mara",
    subtitle: "Offline-first multi-tenant POS",
    scale: "Java · 82 sources",
    description:
      "A till has to keep selling through a partition while the ledger and tax record it feeds stay consistent, so authority is split: the terminal is authoritative for its own counter and signs every sale into a hash-chained journal; the server is authoritative for what the sales mean together. Three services sit behind it: identity and enrolment, a sync service holding an append-only verified second copy of each journal, and a core service posting a double-entry ledger with leased fiscal numbers. The till's TypeScript and the server's Java agree on the signed encoding, checked in both directions. Not built: an API gateway, catalogue and stock, and a back-office UI. M-Pesa on the till is simulated.",
    metrics: [
      { value: "156", label: "Java tests" },
      { value: "3", label: "services" },
      { value: "Ed25519", label: "signed journal" },
    ],
    tech: ["Java 21", "Spring Boot 3", "PostgreSQL", "Row-level security", "Next.js PWA", "Ed25519"],
    image: "/images/mara.jpg",
    github: "https://github.com/kennie-afk/java.0/tree/main/mara",
  },
  {
    id: 9,
    slug: "hms",
    lang: "Java 21",
    tests: "101",
    domain: "Health systems",
    title: "HMS",
    subtitle: "Health management system for Kenya",
    scale: "Java · 88 sources",
    description:
      "A multi-facility health management system for Kenya, built as a modular monolith: one Spring Boot service with fifteen feature modules over one PostgreSQL, so a dispense, its invoice line and its audit entry commit or roll back together. It covers patient registry with duplicate detection, scheduling and a priority queue, clinical encounters, pharmacy, laboratory, imaging with second-person sign-off, billing, claims readiness, inpatient, maternal and child health, HIV, TB and chronic-disease registers, configurable reports with CSV and DHIS2 export, a FHIR R4 read interface, a patient portal that shows results only after a clinician releases them, and offline-tolerant bedside capture. Tenancy is PostgreSQL row-level security and the audit trail is hash-chained in the same transaction as each change. Safety rules live in the database: exclusion constraints stop double booking, issued invoice lines are frozen by trigger, lab results need a second validator, controlled drugs need a witness. M-Pesa is simulated and SHA/DHA claim submission is an unverified stub that sends nothing. The DHIS2 file has not been sent to a DHIS2 server, the FHIR output has not been run through the HL7 validator, and the official MOH returns, a KHIS export and DICOM imaging are not built.",
    metrics: [
      { value: "101", label: "backend tests" },
      { value: "15", label: "backend modules" },
      { value: "61", label: "console routes" },
    ],
    tech: ["Java 21", "Spring Boot 3", "PostgreSQL", "Flyway", "Row-level security", "Next.js 16"],
    image: "/images/hms.jpg",
  },
];

// icon is a Simple Icons slug (rendered via Iconify) for real, named tools and
// languages. Architectural patterns and statistical techniques aren't products
// and don't have logos, so those entries carry no icon rather than a
// meaningless generic one.
export const skillGroups = [
  {
    group: "Architecture",
    items: [
      { name: "Microservices" },
      { name: "Database-per-service" },
      { name: "Event-driven design" },
      { name: "Transactional outbox" },
      { name: "Saga with compensation" },
      { name: "Multi-tenancy" },
      { name: "Row-level security" },
      { name: "RFC 7807" },
    ],
  },
  {
    group: "Full-stack",
    items: [
      { name: "Next.js 16", icon: "nextdotjs" },
      { name: "React 19", icon: "react" },
      { name: "Tailwind CSS", icon: "tailwindcss" },
      { name: "TanStack Query", icon: "reactquery" },
      { name: "Zustand" },
      { name: "Node.js", icon: "nodedotjs" },
      { name: "Spring Boot 3", icon: "springboot" },
      { name: "FastAPI", icon: "fastapi" },
    ],
  },
  {
    group: "Languages",
    items: [
      { name: "Python", icon: "python" },
      { name: "Java 21", icon: "openjdk" },
      { name: "TypeScript", icon: "typescript" },
      { name: "JavaScript", icon: "javascript" },
      { name: "SQL" },
      { name: "PHP", icon: "php" },
    ],
  },
  {
    group: "Data & messaging",
    items: [
      { name: "PostgreSQL", icon: "postgresql" },
      { name: "MySQL", icon: "mysql" },
      { name: "Redis", icon: "redis" },
      { name: "PgBouncer" },
      { name: "Flyway", icon: "flyway" },
      { name: "Apache Kafka", icon: "apachekafka" },
    ],
  },
  {
    group: "Testing & DevOps",
    items: [
      { name: "pytest", icon: "pytest" },
      { name: "JUnit", icon: "junit5" },
      { name: "vitest", icon: "vitest" },
      { name: "Playwright", icon: "playwright" },
      { name: "mypy --strict" },
      { name: "ruff", icon: "ruff" },
      { name: "Docker", icon: "docker" },
      { name: "Kubernetes", icon: "kubernetes" },
      { name: "Prometheus", icon: "prometheus" },
      { name: "Grafana", icon: "grafana" },
      { name: "Loki" },
    ],
  },
  {
    group: "Machine learning",
    items: [
      { name: "Two-tower retrieval" },
      { name: "Sampled softmax" },
      { name: "HNSW / ANN search" },
      { name: "Gradient-boosted ranking" },
      { name: "Platt scaling" },
      { name: "Point-in-time feature stores" },
      { name: "Thompson sampling" },
      { name: "MMR diversification" },
    ],
  },
  {
    group: "Statistics & experimentation",
    items: [
      { name: "Mixture SPRT" },
      { name: "A/A validation" },
      { name: "Hash-bucketed assignment" },
      { name: "PSI & Kolmogorov-Smirnov" },
      { name: "Chi-squared testing" },
      { name: "Adverse impact (four-fifths)" },
      { name: "Determinism probing" },
    ],
  },
  {
    group: "Taught",
    items: [
      { name: "Java & Spring Boot", icon: "openjdk" },
      { name: "React", icon: "react" },
      { name: "Node.js", icon: "nodedotjs" },
      { name: "Laravel", icon: "laravel" },
      { name: "Robotics (ZMRobo)" },
    ],
  },
];
