import { ListChecks, ShieldAlert, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type QuickAction = {
  label: string;
  prompt: string;
  requiresDocument?: boolean;
  icon: LucideIcon;
};

export const REAM_AI_EXAMPLE_PROMPTS = [
  'What is a non-disclosure agreement?',
  'Explain the difference between a contract and an agreement',
  'What are common clauses in employment contracts?',
  'How do I protect intellectual property?',
  'What should I look for when reviewing a lease?',
] as const;

export const REAM_AI_QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Summarize',
    prompt:
      'Provide an executive summary that highlights the purpose, parties, and the three most important obligations in this document.',
    requiresDocument: true,
    icon: Sparkles,
  },
  {
    label: 'Risk Review',
    prompt:
      'Identify the top risks, liabilities, or unusual clauses in this document. Explain why they matter and recommend follow-up actions.',
    requiresDocument: true,
    icon: ShieldAlert,
  },
  {
    label: 'Key Obligations',
    prompt:
      'List all material obligations, deadlines, and compliance requirements in this document with clear bullet points.',
    requiresDocument: true,
    icon: ListChecks,
  },
];

export const CONTRACT_REVIEW_GOAL_SUGGESTIONS = [
  'Find potential risks and liabilities',
  'Identify missing or unclear terms',
  'Review payment and termination clauses',
  'Check for compliance issues',
  'Analyze intellectual property terms',
  'Review liability and indemnification',
  'Assess force majeure provisions',
  'Evaluate confidentiality terms',
] as const;
