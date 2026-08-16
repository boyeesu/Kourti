// Single source of truth for per-route SEO metadata used by the
// build-time prerenderer (scripts/prerender.mjs) and the sitemap.
//
// The site is a client-side SPA, so social scrapers and non-JS crawlers
// only ever see the static HTML shipped per route. Keep the values here in
// sync with each page's <SEO> component props.
//
// IMPORTANT: any new client route added to src/App.tsx must be added here,
// otherwise a direct load / share of that URL will 404 (no SPA catch-all).

export const SITE_URL = 'https://kourti.com';
export const SITE_NAME = 'Kourti Legal';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Kourti Legal',
  url: 'https://kourti.com',
  logo: 'https://kourti.com/favicon.png',
  description:
    'Open-source AI-powered legal practice management software for matters, contracts, deadlines and document analysis.',
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'info@kourti.com',
    contactType: 'customer support',
  },
  sameAs: ['https://github.com/boyeesu/Kourti'],
  parentOrganization: {
    '@type': 'Organization',
    name: 'Navigi',
    url: 'https://navigi.io',
  },
};

const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Kourti Legal',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'Open-source AI-powered legal practice management app for matters, contracts, deadlines, document analysis and client management.',
  isAccessibleForFree: true,
};

const reportSchema = {
  '@context': 'https://schema.org',
  '@type': 'Report',
  name: 'The State of Technology in Legal Practice in Nigeria — Q1 2026',
  headline: 'LegalTech in Nigeria: Q1 2026 Report',
  description:
    'Free report covering AI adoption, court digitisation, cybersecurity challenges, and practice management trends in Nigerian legal practice.',
  url: `${SITE_URL}/report/legaltech-nigeria-q1-2026`,
  inLanguage: 'en',
  isAccessibleForFree: true,
  publisher: {
    '@type': 'Organization',
    name: 'Kourti Legal',
    logo: { '@type': 'ImageObject', url: 'https://kourti.com/favicon.png' },
  },
};

// `title` is the FULL <title> as rendered (the SEO component appends
// " | Kourti Legal" to every non-home page).
export const routes = [
  {
    path: '/',
    title: 'Kourti Legal | The open-source workspace for legal practice',
    description:
      'Keep matters, clients, documents and deadlines in one focused workspace. Kourti is open source and available for guided demos.',
    jsonLd: [organizationSchema, softwareSchema],
    changefreq: 'weekly',
    priority: '1.0',
  },
  {
    path: '/features',
    title: 'Features | Kourti Legal',
    description:
      "Explore everything Kourti's AI legal associate can do — AI redline, tabular review, negotiation copilot, autonomous agents, intelligence, and a document-aware assistant, on top of full practice management.",
    changefreq: 'monthly',
    priority: '0.9',
  },
  {
    path: '/security',
    title: 'Security | Kourti Legal',
    description:
      'How Kourti Legal protects your matters, documents, and client data — encryption in transit and at rest, role-based access, SSO, tenant isolation, and auditable AI.',
    changefreq: 'monthly',
    priority: '0.7',
  },
  {
    path: '/about',
    title: 'About Us | Kourti Legal',
    description:
      'Kourti Legal is built by former legal practitioners who understand real legal workflows. Learn about our mission to eliminate administrative burden with AI-powered legal software.',
    changefreq: 'monthly',
    priority: '0.8',
  },
  {
    path: '/contact',
    title: 'Contact Us | Kourti Legal',
    description:
      'Get in touch with the Kourti Legal team. Book a demo, request support, or ask about our AI-powered legal practice management platform. We respond within 24 hours.',
    changefreq: 'monthly',
    priority: '0.8',
  },
  {
    path: '/assessment',
    title: 'Practice Technology Maturity Assessment | Kourti Legal',
    description:
      "Benchmark your law firm's technology maturity across 6 key dimensions. Take our free 2-minute assessment and get a personalised score with tailored recommendations.",
    changefreq: 'monthly',
    priority: '0.8',
  },
  {
    path: '/report/legaltech-nigeria-q1-2026',
    title: 'LegalTech in Nigeria Q1 2026 Report | Kourti Legal',
    description:
      'The State of Technology in Legal Practice in Nigeria — Q1 2026. Download the free report covering AI adoption, court digitisation, cybersecurity challenges, and practice management trends.',
    jsonLd: [reportSchema],
    changefreq: 'yearly',
    priority: '0.7',
  },
  {
    path: '/privacy-policy',
    title: 'Privacy Policy | Kourti Legal',
    description:
      'Learn how Kourti Legal collects, uses, stores and protects your personal information. Read our full privacy policy covering data security, cookies, and your rights.',
    changefreq: 'yearly',
    priority: '0.3',
  },
  {
    path: '/terms-of-use',
    title: 'Terms of Service | Kourti Legal',
    description:
      'Read the Terms of Service for Kourti Legal. Understand your rights and obligations when using our AI-powered legal practice management platform.',
    changefreq: 'yearly',
    priority: '0.3',
  },
  {
    path: '/ai-policy',
    title: 'AI Policy | Kourti Legal',
    description:
      'Learn how Kourti Legal builds, governs and uses artificial intelligence responsibly, including data handling, human oversight, accuracy and confidentiality.',
    changefreq: 'yearly',
    priority: '0.3',
  },
  {
    path: '/dpa',
    title: 'Data Processing Agreement | Kourti Legal',
    description:
      "Kourti Legal's Data Processing Agreement governing how customer personal data is processed under GDPR and NDPR.",
    changefreq: 'yearly',
    priority: '0.3',
  },
  {
    path: '/subprocessors',
    title: 'Sub-processors | Kourti Legal',
    description:
      'Third-party sub-processors used by Kourti Legal, including their purpose, data categories and location.',
    changefreq: 'yearly',
    priority: '0.3',
  },
  {
    path: '/cookie-policy',
    title: 'Cookie Policy | Kourti Legal',
    description:
      'Learn how Kourti Legal uses cookies and similar technologies and how to manage your preferences.',
    changefreq: 'yearly',
    priority: '0.3',
  },
];
