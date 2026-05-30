/**
 * Kourti marketing knowledge base — the source content the public chatbot
 * (MARTHA) is grounded on. Each entry becomes one or more embedded chunks in
 * the `marketing_kb_chunks` table via `scripts/ingestMarketingKb.ts`.
 *
 * Keep this factual and conservative. Anything that changes often (exact plan
 * prices, seat counts) is intentionally NOT hard-coded here — the chat route
 * injects live plan data from `/api/v1/public/plans` at query time so the bot
 * never quotes stale numbers. Edit/extend these entries to teach MARTHA more.
 *
 * `id` is a stable slug used as a natural key on re-ingest (content is upserted
 * by id, so changing the text here and re-running ingestion refreshes cleanly).
 */

export interface KnowledgeEntry {
  id: string;
  title: string;
  category: 'product' | 'pricing' | 'faq' | 'company';
  content: string;
}

export const KOURTI_KNOWLEDGE: KnowledgeEntry[] = [
  // ── Product & features ────────────────────────────────────────────────────
  {
    id: 'what-is-kourti',
    title: 'What is Kourti?',
    category: 'product',
    content: `Kourti is an AI-powered legal operations platform built for law firms and in-house legal teams. It brings contract drafting, review, analysis, and everyday legal work into one workspace, with an AI legal assistant called MARTHA at the centre. Kourti is designed to help legal teams move faster on routine work — reviewing contracts, generating drafts, comparing documents, and answering questions about their own files — so lawyers can spend more time on judgement and strategy. Kourti has a particular focus on the African and Nigerian legal market.`,
  },
  {
    id: 'meet-martha',
    title: 'MARTHA — your AI legal assistant',
    category: 'product',
    content: `MARTHA is Kourti's AI legal assistant. You can chat with MARTHA in plain language to ask questions, get help drafting and reviewing contracts, and pull answers out of your own documents. Inside the Kourti app, MARTHA uses retrieval-augmented generation (RAG): it searches your organisation's uploaded documents and contracts and grounds its answers in that content, with the relevant sources surfaced. MARTHA can summarise documents, explain clauses, surface risks, and help you respond quickly.`,
  },
  {
    id: 'contract-tools',
    title: 'Contract analysis, comparison, and generation',
    category: 'product',
    content: `Kourti includes a suite of AI contract tools. Advanced contract analysis reviews a contract and returns structured insight on key terms, obligations, and potential risks. Contract comparison highlights the differences between two versions or two documents so you can see what changed. The contract generator helps you draft new agreements from a prompt. These tools are built to give lawyers a strong first pass that they can then refine, rather than replacing professional review.`,
  },
  {
    id: 'document-intelligence',
    title: 'Document intelligence and your knowledge base',
    category: 'product',
    content: `When you upload documents and contracts to Kourti, the platform processes them into a searchable knowledge base. Text is extracted, split into chunks, and embedded into a vector database so MARTHA can find the most relevant passages when you ask a question. This means you can ask natural-language questions across your matters and get answers grounded in your actual files, with citations back to the source document.`,
  },
  {
    id: 'automation-suite',
    title: 'Automation suite (Professional and above)',
    category: 'product',
    content: `Kourti's automation suite is available on Professional and higher plans. It includes AI agents, negotiation support, legal intelligence, playbooks, tabular review, and redlining. These features help teams standardise how they handle recurring legal work — for example applying a consistent playbook to incoming contracts, reviewing many documents in a table view, or producing tracked-change redlines automatically. Teams on the trial get a taste of Professional features.`,
  },
  {
    id: 'collaboration',
    title: 'Team collaboration',
    category: 'product',
    content: `Kourti is built for teams. You can invite colleagues into your organisation, work together on matters, and chat within the platform. Access to advanced features depends on your plan, and the number of people who can use Kourti depends on how many seats your organisation has.`,
  },

  // ── Pricing & plans ───────────────────────────────────────────────────────
  {
    id: 'pricing-model',
    title: 'How Kourti pricing works',
    category: 'pricing',
    content: `Kourti uses seat-based, prepaid pricing. You choose a plan and the number of seats (users) you need, and you pay per seat — the total is the plan's per-seat price multiplied by the number of seats. Billing is handled securely through Paystack. Because seats are prepaid, you always know your cost up front, and you can add seats as your team grows. For the current plans and per-seat prices, see the pricing page or ask and I'll share the latest figures.`,
  },
  {
    id: 'trial',
    title: 'Free trial',
    category: 'pricing',
    content: `New users can start on a trial that includes Professional-tier capabilities, so you can experience MARTHA and the automation suite before committing. When the trial ends you can move onto a paid plan that fits your team. To start, create an account from the Kourti website.`,
  },
  {
    id: 'plans-overview',
    title: 'Plans and tiers',
    category: 'pricing',
    content: `Kourti offers multiple plans tiered by capability and team size. Higher tiers (Professional and above) unlock the full automation suite — agents, negotiations, intelligence, playbooks, tabular review, and redline. Lower tiers cover core assistant and document features. The exact plan names, what each includes, and per-seat prices are kept up to date on the pricing page; I can pull the live details for you.`,
  },
  {
    id: 'billing-questions',
    title: 'Billing, upgrades, and adding seats',
    category: 'pricing',
    content: `You can upgrade your plan or add more seats as your team grows; pricing scales per seat. Payments are processed through Paystack. If you have a specific billing question — invoices, currency, enterprise pricing, or special arrangements — the Kourti team is happy to help; reach out via the contact page.`,
  },

  // ── FAQ & onboarding ──────────────────────────────────────────────────────
  {
    id: 'getting-started',
    title: 'How to get started',
    category: 'faq',
    content: `Getting started is simple: create an account on the Kourti website to begin your trial, set up your organisation, invite your team, and upload the documents you want MARTHA to work with. From there you can chat with MARTHA, run contract analysis, generate drafts, and explore the automation suite. If you'd like a guided walkthrough or a demo, contact the Kourti team.`,
  },
  {
    id: 'who-is-it-for',
    title: 'Who is Kourti for?',
    category: 'faq',
    content: `Kourti is built for law firms, solo practitioners, and in-house legal teams who want to handle contracts and legal work more efficiently with AI. Whether you're a small practice looking to move faster or a larger team standardising your workflows, Kourti scales with you through seat-based plans.`,
  },
  {
    id: 'maturity-assessment',
    title: 'Legal practice maturity assessment',
    category: 'faq',
    content: `Kourti offers a free legal-practice maturity assessment on the website. It's a short questionnaire that scores how mature your legal operations are across several dimensions and gives you a tailored result. It's a useful starting point to understand where AI and automation could help your practice most.`,
  },
  {
    id: 'support-contact',
    title: 'Getting help and contacting Kourti',
    category: 'faq',
    content: `If you need help, have questions the assistant can't answer, or want to talk to a person, use the contact page on the Kourti website to reach the team. For sales, demos, partnerships, or enterprise enquiries, the contact form is the fastest way to get a response — the team typically replies within 24 hours.`,
  },

  // ── Company & trust ───────────────────────────────────────────────────────
  {
    id: 'data-security',
    title: 'Data security and confidentiality',
    category: 'company',
    content: `Kourti understands that legal documents are highly confidential. Your organisation's documents and data are kept within your own workspace and are used to power features for your team — for example, MARTHA only searches your organisation's own documents when answering your questions. For full details on how data is handled, see the privacy policy and terms of use on the Kourti website, or contact the team with specific security or compliance questions.`,
  },
  {
    id: 'about-kourti',
    title: 'About Kourti',
    category: 'company',
    content: `Kourti is a legal technology company building AI tools that make legal work faster and more accessible, with a strong focus on the African and Nigerian market. The platform combines an AI legal assistant, document intelligence, and contract automation in a single workspace. You can learn more on the About page of the Kourti website.`,
  },
  {
    id: 'legal-policies',
    title: 'Privacy policy and terms of use',
    category: 'company',
    content: `Kourti publishes a privacy policy and terms of use on its website. These cover how the platform collects and uses data, your rights, and the terms governing use of the service. If you have questions about either, the contact page is the best way to reach the team.`,
  },
];
