# Kourti Legal — AI Policy

**Last Updated:** May 2026
**Owner:** Kourti Legal
**Status:** Published — surfaced publicly at `/ai-policy` on the marketing site

---

## Purpose & Scope

This document is the detailed, internal-and-external reference behind the public
[AI Policy page](../marketing/src/pages/AIPolicy.tsx) (`/ai-policy`). The public page is the
plain-language summary; this document is the authoritative source for what we commit to, why,
and how each commitment is implemented across the platform.

It covers every AI-powered capability in Kourti Legal, including but not limited to:

- Document & contract review, summarization, and clause extraction
- Drafting assistance and redline suggestions
- Legal research support and retrieval
- Matter, deadline, and task intelligence
- Conversational assistants (in-product copilots and the public MARTHA marketing widget)
- Automations, agents, negotiations, intelligence, playbooks, and tabular review
  (the Professional+ automation suite)

It applies to all customers, all environments (production, staging), and all third-party model
providers acting as subprocessors.

It should be read together with the [Privacy Policy](../marketing/src/pages/PrivacyPolicy.tsx),
[Terms of Use](../marketing/src/pages/TermsOfUse.tsx), and the
[Security](../marketing/src/pages/Security.tsx) page.

---

## 1. Our AI Principles

Kourti builds AI for the practice of law, where accuracy, confidentiality, and accountability are
non-negotiable. Every AI feature is governed by five principles:

| Principle                  | What it means                                          | How we honor it                                                                                                      |
| -------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Human in control**       | AI assists; it never replaces professional judgment.   | Outputs are framed as drafts/suggestions; a qualified person remains responsible for all work product.               |
| **Confidential by design** | Client and matter data is privileged.                  | Customer content is never used to train third-party foundation models; processed only to return results to the user. |
| **Transparent**            | Users know where AI is used and where it can be wrong. | AI surfaces are labeled; this policy and in-product copy state limitations.                                          |
| **Accountable**            | AI actions are attributable.                           | AI usage is logged for security, audit, and supervision (see §9).                                                    |
| **Fair and lawful**        | We limit bias and comply with applicable rules.        | Bias evaluation in our governance process; data-protection and professional-conduct alignment.                       |

---

## 2. How AI Is Used in the Platform

AI features are **tools that produce suggestions and drafts**. Outputs are **not legal advice** and
must be reviewed and verified by a qualified professional before they are relied upon or shared.

| Capability                   | Description                                                   | Tier                    |
| ---------------------------- | ------------------------------------------------------------- | ----------------------- |
| Document & contract review   | Summarization, clause extraction, risk flags                  | Core                    |
| Drafting assistance          | Suggested edits, redline suggestions                          | Professional+ (redline) |
| Legal research support       | Retrieval of relevant information                             | Core                    |
| Matter/deadline intelligence | Organization and suggestions                                  | Core                    |
| Conversational assistants    | In-product copilots; public MARTHA RAG widget                 | Core / public           |
| Automation suite             | Agents, negotiations, intelligence, playbooks, tabular review | Professional+           |

> Feature availability is governed by the `plan_features` table and `requireFeature` middleware.
> The automation suite is Professional+ (trial maps to pro).

---

## 3. AI Providers & Subprocessors

3.1 We use trusted third-party model providers to deliver certain AI capabilities. These providers
act as **subprocessors** and are bound by confidentiality and data-protection obligations.

3.2 We contractually require that data submitted through the Services is **not used to train or
improve third-party foundation models** and is processed only to return results to the user.

3.3 The list of AI subprocessors may change as our technology evolves. Material changes are
reflected in this policy or in our subprocessor documentation.

**Maintenance note:** When adding or changing a model provider, update this section, confirm the
no-training contractual term is in place, and run the change through the governance review in §9.

---

## 4. Data Handling & Confidentiality

4.1 Content submitted to AI features (documents, prompts, matter information) is processed solely
to generate the requested output and to operate the Services.

4.2 We do not sell customer data, and we do not use the contents of privileged or confidential
materials to train models offered to other customers.

4.3 Data in transit and at rest is protected using encryption and access controls consistent with
our security practices. See the [Security](../marketing/src/pages/Security.tsx) page.

4.4 Where we use aggregated or de-identified data to improve our own Services, we do so in a manner
that does not identify a customer, their clients, or their matters.

4.5 **Tenant isolation.** Customer data is logically isolated per organization. AI retrieval and
context assembly operate only within the requesting organization's data boundary.

4.6 **Client Portal.** The Client Portal exposes case visibility and automated updates to external
clients under a separate identity and auth surface; AI-generated case updates are subject to the
same human-oversight and confidentiality rules as any other output.

---

## 5. Accuracy, Limitations & Hallucinations

5.1 AI systems can produce output that is incomplete, outdated, or factually incorrect
("hallucinations"). AI does not understand a matter the way a lawyer does.

5.2 Citations, authorities, figures, and quotations generated by AI **must be independently
verified** before use. AI output is not a substitute for legal research or professional review.

5.3 AI output may not reflect the most current law, regulations, or court rules in a given
jurisdiction.

5.4 **Retrieval grounding.** Where features are retrieval-augmented (e.g., MARTHA, document Q&A),
answers are grounded in supplied source material, but grounding reduces — it does not eliminate —
the risk of error. Users should confirm against the underlying documents.

---

## 6. Human Oversight & Professional Responsibility

6.1 The user remains responsible for all work product produced with AI assistance, including its
accuracy, completeness, and compliance with applicable professional-conduct rules.

6.2 AI features that can take actions on a user's behalf (automations, agents) operate within limits
the user configures and remain subject to the user's review and supervision.

6.3 The user is responsible for determining whether disclosure of AI use to clients, courts, or
counterparties is required in their jurisdiction.

6.4 **Default to review.** Agentic and automation features should default to surfacing proposed
actions for confirmation rather than executing irreversibly, especially for outbound or
hard-to-reverse actions.

---

## 7. Fairness & Bias

AI models can reflect biases present in their training data. We take reasonable steps to evaluate
and reduce harmful bias in our AI features, but we cannot guarantee output is free from bias. Users
should exercise judgment, particularly where output could affect individuals' rights or interests.

---

## 8. Acceptable Use of AI Features

Users agree not to use AI features to:

- Generate or distribute unlawful, infringing, deceptive, or harmful content.
- Submit data they are not authorized to process, or that violates third-party rights or
  confidentiality obligations.
- Attempt to reverse engineer, extract, or misuse the underlying models or training data.
- Present AI output as independent legal advice without appropriate professional review.

Violations may result in suspension of AI features or the account, consistent with the Terms of Use.

---

## 9. Logging, Auditability & Governance

9.1 Use of AI features may be logged to support security, troubleshooting, audit, and supervision.

9.2 We maintain internal governance for evaluating new AI capabilities and model providers before
they are made available in the Services. New capabilities pass through:

1. **Provider/data review** — confirm subprocessor terms, no-training guarantee, data residency.
2. **Confidentiality review** — confirm tenant isolation and that no privileged data leaks across
   boundaries.
3. **Accuracy/bias evaluation** — assess output quality and known failure modes; document
   limitations.
4. **Human-oversight check** — confirm the feature defaults to review for irreversible actions.
5. **Disclosure update** — update this policy, the public page, and subprocessor docs as needed.

9.3 Platform administrators with appropriate capability roles can review AI-related audit trails
and the email/communication log via the admin surface.

---

## 10. User Choices & Configuration

Where AI features are optional, organization administrators may be able to enable or disable them.
Disabling certain AI features may limit functionality. Feature gating is enforced server-side via
`requireFeature`; organization-level overrides are possible through the platform admin feature
overrides. Customers with questions about configuring AI features for their firm should contact us.

---

## 11. Updates to This Policy

We may update this AI Policy as our technology, providers, and legal obligations evolve. The updated
version is posted on our website with a new effective date. Continued use of the Services
constitutes acceptance of the revised policy.

**Change process:** Update both this document and the public
[AI Policy page](../marketing/src/pages/AIPolicy.tsx), bump the "Last Updated" date in both, and
update the `lastmod` for `/ai-policy` in [sitemap.xml](../marketing/public/sitemap.xml).

---

## 12. Contact

Questions about this AI Policy or our use of AI: **info@kourti.com**

---

## Appendix A — Where this lives in the codebase

| Artifact            | Path                                                           |
| ------------------- | -------------------------------------------------------------- |
| Public page (React) | `marketing/src/pages/AIPolicy.tsx`                             |
| Route registration  | `marketing/src/App.tsx` (`/ai-policy`)                         |
| Footer link         | `marketing/src/components/sections/Footer.tsx` (Legal section) |
| Sitemap entry       | `marketing/public/sitemap.xml`                                 |
| This document       | `docs/ai-policy.md`                                            |

## Appendix B — Maintenance checklist when AI changes ship

- [ ] New/changed model provider? Update §3 and confirm no-training contract term.
- [ ] New AI-powered feature? Add to §2 table and run the §9 governance steps.
- [ ] Data flow change? Re-confirm §4 (isolation, no training on customer content).
- [ ] Material change? Bump "Last Updated" in this doc **and** the public page; update sitemap `lastmod`.
