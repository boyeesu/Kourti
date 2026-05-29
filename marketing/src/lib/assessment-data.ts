/* ────────────────────────────────────────────
   Practice Technology Maturity Assessment
   Questions, Scoring, Tiers & Recommendations
   ──────────────────────────────────────────── */

export type DimensionKey =
  | 'legal_research'
  | 'document_mgmt'
  | 'court_filing'
  | 'ai_adoption'
  | 'cybersecurity'
  | 'practice_mgmt';

export interface AssessmentOption {
  label: string;
  score: number; // 1-4
}

export interface AssessmentQuestion {
  id: string;
  dimension: DimensionKey;
  question: string;
  options: AssessmentOption[];
}

export interface TierDefinition {
  name: string;
  range: [number, number];
  color: string; // tailwind color class
  bgColor: string;
  description: string;
}

export interface DimensionInfo {
  key: DimensionKey;
  label: string;
  shortLabel: string;
}

/* ─── Dimensions ─── */

export const dimensions: DimensionInfo[] = [
  { key: 'legal_research', label: 'Legal Research Tools', shortLabel: 'Research' },
  { key: 'document_mgmt', label: 'Document Management', shortLabel: 'Documents' },
  { key: 'court_filing', label: 'Court Filing & Compliance', shortLabel: 'Filing' },
  { key: 'ai_adoption', label: 'AI Adoption', shortLabel: 'AI' },
  { key: 'cybersecurity', label: 'Cybersecurity & Data Protection', shortLabel: 'Security' },
  { key: 'practice_mgmt', label: 'Practice & Client Management', shortLabel: 'Practice' },
];

/* ─── Questions ─── */

export const questions: AssessmentQuestion[] = [
  {
    id: 'q1',
    dimension: 'legal_research',
    question: 'How does your firm currently conduct legal research?',
    options: [
      { label: 'Primarily physical law reports and textbooks', score: 1 },
      { label: 'Free online searches (Google, Nigerian court websites)', score: 2 },
      { label: 'Paid legal databases (LawPavilion, LegalPedia)', score: 3 },
      { label: 'AI-powered research tools with natural language queries', score: 4 },
    ],
  },
  {
    id: 'q2',
    dimension: 'legal_research',
    question: 'How quickly can you typically find relevant case law for a new matter?',
    options: [
      { label: 'Several hours to a full day', score: 1 },
      { label: '1-3 hours with manual database searches', score: 2 },
      { label: '30-60 minutes using structured databases', score: 3 },
      { label: 'Under 15 minutes using AI-assisted tools', score: 4 },
    ],
  },
  {
    id: 'q3',
    dimension: 'document_mgmt',
    question: 'How does your firm store and organize case files and documents?',
    options: [
      { label: 'Physical files and cabinets only', score: 1 },
      {
        label: 'Mix of physical files and basic digital folders (Google Drive, local drives)',
        score: 2,
      },
      { label: 'Dedicated document management system with tagging and search', score: 3 },
      {
        label: 'Cloud-based DMS with version control, OCR, and automated categorization',
        score: 4,
      },
    ],
  },
  {
    id: 'q4',
    dimension: 'document_mgmt',
    question: 'How do you handle contract review and document drafting?',
    options: [
      { label: 'Entirely manual drafting from scratch each time', score: 1 },
      { label: 'Reusing past templates with manual edits', score: 2 },
      { label: 'Template library with clause banks and standardized formats', score: 3 },
      {
        label: 'AI-assisted drafting with automated clause suggestions and risk flagging',
        score: 4,
      },
    ],
  },
  {
    id: 'q5',
    dimension: 'court_filing',
    question: 'How does your firm handle court filings and regulatory compliance tracking?',
    options: [
      { label: 'Manual tracking with physical diaries and personal reminders', score: 1 },
      { label: 'Shared spreadsheets or calendar apps for deadlines', score: 2 },
      { label: 'Practice management software with automated deadline alerts', score: 3 },
      {
        label: 'Integrated system with auto-tracked filing requirements and e-filing support',
        score: 4,
      },
    ],
  },
  {
    id: 'q6',
    dimension: 'ai_adoption',
    question: "What is your firm's current stance on AI tools in legal work?",
    options: [
      { label: 'Not considered or actively resisted', score: 1 },
      { label: 'Aware but have not tried any AI tools', score: 2 },
      {
        label: 'Experimenting with general AI tools (e.g., ChatGPT) for drafting or research',
        score: 3,
      },
      { label: 'Using legal-specific AI tools integrated into daily workflows', score: 4 },
    ],
  },
  {
    id: 'q7',
    dimension: 'ai_adoption',
    question: 'How does your firm approach technology training and adoption?',
    options: [
      { label: 'No formal training; staff learn tools on their own', score: 1 },
      { label: 'Occasional informal knowledge sharing among colleagues', score: 2 },
      { label: 'Periodic training sessions when new tools are introduced', score: 3 },
      {
        label: 'Structured onboarding, regular upskilling, and a designated tech champion',
        score: 4,
      },
    ],
  },
  {
    id: 'q8',
    dimension: 'cybersecurity',
    question: 'How does your firm protect client data and confidential information?',
    options: [
      { label: 'Basic password protection on devices, no formal policy', score: 1 },
      { label: 'Password policies exist but no encryption or access controls', score: 2 },
      { label: 'Encrypted storage, access controls, and a basic data protection policy', score: 3 },
      {
        label:
          'Comprehensive security: encryption, 2FA, audit logs, NDPA compliance, incident response plan',
        score: 4,
      },
    ],
  },
  {
    id: 'q9',
    dimension: 'practice_mgmt',
    question: 'How does your firm manage matters, billing, and client communication?',
    options: [
      { label: 'Paper records, manual invoicing, phone/email only', score: 1 },
      { label: 'Spreadsheets for tracking, basic accounting software, WhatsApp groups', score: 2 },
      { label: 'Practice management software for matter tracking and billing', score: 3 },
      {
        label:
          'Integrated platform covering matter management, billing, client portal, and analytics',
        score: 4,
      },
    ],
  },
  {
    id: 'q10',
    dimension: 'practice_mgmt',
    question: "How do you measure your firm's operational performance?",
    options: [
      { label: 'No formal metrics tracked', score: 1 },
      { label: 'Basic tracking (revenue, number of cases) done manually', score: 2 },
      {
        label: 'Regular reporting on key metrics like utilization and revenue per matter',
        score: 3,
      },
      {
        label: 'Real-time dashboards with automated analytics across all practice areas',
        score: 4,
      },
    ],
  },
];

/* ─── Tiers ─── */

export const tiers: TierDefinition[] = [
  {
    name: 'Explorer',
    range: [10, 17],
    color: 'text-[hsl(var(--warning))]',
    bgColor: 'bg-[hsl(var(--warning))]/10',
    description:
      'Your firm relies heavily on traditional methods. There is significant opportunity to improve efficiency, reduce risk, and serve clients faster through targeted technology adoption.',
  },
  {
    name: 'Adopter',
    range: [18, 24],
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    description:
      "You've started digitizing some workflows but key areas still depend on manual processes. Focused investment in legal-specific tools could dramatically improve your competitive position.",
  },
  {
    name: 'Leader',
    range: [25, 32],
    color: 'text-[hsl(270,50%,70%)]',
    bgColor: 'bg-[hsl(270,50%,70%)]/10',
    description:
      'Your firm has solid technology foundations across most dimensions. Fine-tuning your stack with AI-powered tools and deeper integrations would put you ahead of 90% of Nigerian practices.',
  },
  {
    name: 'Innovator',
    range: [33, 40],
    color: 'text-[hsl(var(--success))]',
    bgColor: 'bg-[hsl(var(--success))]/10',
    description:
      'You are among the most tech-forward legal practices in Nigeria. Continue pushing boundaries with AI, automation, and data analytics to maintain your edge.',
  },
];

/* ─── Scoring Utilities ─── */

export type Answers = Record<string, number>; // questionId -> selected score

export interface DimensionScore {
  key: DimensionKey;
  label: string;
  score: number; // raw average (1-4)
  percent: number; // 0-100
  maxScore: number;
}

export interface AssessmentResult {
  totalScore: number;
  maxScore: number;
  percent: number;
  tier: TierDefinition;
  dimensionScores: DimensionScore[];
}

export function calculateResults(answers: Answers): AssessmentResult {
  const totalScore = Object.values(answers).reduce((sum, s) => sum + s, 0);
  const maxScore = questions.length * 4;
  const percent = Math.round((totalScore / maxScore) * 100);

  const tier = tiers.find((t) => totalScore >= t.range[0] && totalScore <= t.range[1]) || tiers[0];

  const dimensionScores: DimensionScore[] = dimensions.map((dim) => {
    const dimQuestions = questions.filter((q) => q.dimension === dim.key);
    const dimTotal = dimQuestions.reduce((sum, q) => sum + (answers[q.id] || 1), 0);
    const avg = dimTotal / dimQuestions.length;
    return {
      key: dim.key,
      label: dim.label,
      score: avg,
      percent: Math.round((avg / 4) * 100),
      maxScore: dimQuestions.length * 4,
    };
  });

  return { totalScore, maxScore, percent, tier, dimensionScores };
}

/* ─── Per-Dimension Recommendations ─── */

type ScoreBracket = 'low' | 'medium' | 'high';

function getBracket(percent: number): ScoreBracket {
  if (percent <= 50) return 'low';
  if (percent <= 75) return 'medium';
  return 'high';
}

const recommendationMap: Record<DimensionKey, Record<ScoreBracket, string[]>> = {
  legal_research: {
    low: [
      'Start with a paid legal database like LawPavilion or LegalPedia to cut research time by 60%+.',
      'Explore AI-powered research tools that understand natural language queries in Nigerian law context.',
      'Kourti AI can surface relevant case law in seconds -- consider a free trial to see the difference.',
    ],
    medium: [
      'You have a solid research foundation. Consider adding AI-assisted tools to handle complex, multi-jurisdictional queries.',
      'Train your team on advanced search techniques to maximize your current database subscriptions.',
    ],
    high: [
      'Excellent research capabilities. Consider sharing best practices across your team and mentoring junior staff.',
      'Evaluate emerging tools that combine research with drafting and analytics for an end-to-end workflow.',
    ],
  },
  document_mgmt: {
    low: [
      'Digitize your most-used templates and store them in a shared cloud drive as a first step.',
      'Invest in a basic document management system with search and version control capabilities.',
      'Kourti AI offers automated document drafting with Nigerian legal context built in.',
    ],
    medium: [
      'Upgrade to a DMS with OCR, automated tagging, and full-text search to reduce document retrieval time.',
      'Build out your clause library and standardize templates across practice areas.',
    ],
    high: [
      'Your document management is strong. Look into AI-powered contract analysis for faster review cycles.',
      'Consider integrating your DMS with your practice management and billing systems.',
    ],
  },
  court_filing: {
    low: [
      'Replace manual diaries with digital calendar tools that send automated deadline reminders.',
      'Familiarize your team with available e-filing portals (Lagos High Court, Federal High Court).',
      'Practice management software with compliance tracking can eliminate missed deadlines entirely.',
    ],
    medium: [
      'Ensure your deadline tracking covers all jurisdictions you practice in, including state courts.',
      'Explore tools that integrate e-filing status updates directly into your matter management workflow.',
    ],
    high: [
      'You are well-positioned. Stay current as more Nigerian courts roll out e-filing capabilities.',
      'Share your best practices with the wider legal community to drive industry-wide improvement.',
    ],
  },
  ai_adoption: {
    low: [
      'Begin with low-risk AI experiments: use tools for first-draft contract summaries or research memos.',
      'Designate one team member as a technology champion to evaluate and pilot AI tools.',
      'Kourti AI is purpose-built for Nigerian legal practice -- it handles research, drafting, and analysis in one platform.',
    ],
    medium: [
      'Develop an AI usage policy to govern how your team uses generative AI tools with client data.',
      'Move beyond general tools like ChatGPT to legal-specific AI that understands Nigerian statutes and case law.',
    ],
    high: [
      'You are at the forefront of AI adoption. Focus on measuring ROI and expanding AI use to more practice areas.',
      'Consider training programs to ensure all team members, not just tech-savvy ones, can leverage AI tools.',
    ],
  },
  cybersecurity: {
    low: [
      'Implement basic security hygiene: strong passwords, two-factor authentication, and encrypted storage.',
      'Develop a written data protection policy aligned with the Nigeria Data Protection Act (NDPA) 2023.',
      'Client trust depends on data security -- this is a competitive differentiator, not just compliance.',
    ],
    medium: [
      'Conduct a security audit to identify gaps in your current protections.',
      'Add audit logging and access controls so you can track who accesses sensitive client data.',
    ],
    high: [
      'Strong security posture. Ensure you have an incident response plan and conduct regular penetration testing.',
      'Consider ISO 27001 certification to formalize your security practices and build client confidence.',
    ],
  },
  practice_mgmt: {
    low: [
      'Move billing and matter tracking from spreadsheets to dedicated practice management software.',
      'Even a simple tool like Clio or local alternatives can dramatically improve firm operations.',
      'Kourti AI combines matter management, client communication, and analytics in one platform built for African firms.',
    ],
    medium: [
      'Start tracking key performance metrics: utilization rates, revenue per matter, client acquisition cost.',
      'Integrate your billing system with your matter management to reduce administrative overhead.',
    ],
    high: [
      'Excellent operational foundation. Focus on advanced analytics to identify growth opportunities.',
      'Consider client-facing portals to improve transparency and client satisfaction.',
    ],
  },
};

export function getRecommendations(
  dimensionScores: DimensionScore[]
): Record<DimensionKey, string[]> {
  const result: Record<string, string[]> = {};
  for (const ds of dimensionScores) {
    const bracket = getBracket(ds.percent);
    result[ds.key] = recommendationMap[ds.key][bracket];
  }
  return result as Record<DimensionKey, string[]>;
}
