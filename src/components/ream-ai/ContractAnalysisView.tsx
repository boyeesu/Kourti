/* eslint-disable react-refresh/only-export-components */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  Eye,
  Edit3,
  Check,
  X,
  Copy,
  ChevronDown,
  ChevronUp,
  Sparkles,
  FileText,
  BarChart3,
  List,
  ArrowRight,
  ThumbsUp,
  ThumbsDown,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// --- Types ---

export type FindingSeverity = 'critical' | 'warning' | 'info' | 'positive';

export interface AnalysisFinding {
  id: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  /** The exact text from the document that this finding references */
  matchText: string;
  /** Suggested replacement text (if applicable) */
  recommendation?: string;
  /** Section/clause reference */
  section?: string;
  /** Category like 'Liability', 'Termination', 'IP', etc. */
  category: string;
}

export interface AnalysisRecap {
  summary: string;
  riskScore: number; // 0-100
  totalFindings: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  positiveCount: number;
  categories: string[];
}

export type FindingDecision = 'accepted' | 'rejected' | 'pending';

interface ContractAnalysisViewProps {
  documentContent: string;
  documentTitle: string;
  findings: AnalysisFinding[];
  recap: AnalysisRecap;
  isAnalyzing?: boolean;
  onApplyRecommendation?: (findingId: string, newText: string) => void;
  onEditDocument?: (updatedContent: string) => void;
  onExport?: () => void;
  /** Map of finding ID -> decision. Managed by parent. */
  decisions?: Record<string, FindingDecision>;
  onDecision?: (findingId: string, decision: FindingDecision) => void;
}

// --- Helpers ---

const severityConfig: Record<
  FindingSeverity,
  { icon: typeof AlertTriangle; color: string; bgColor: string; borderColor: string; label: string }
> = {
  critical: {
    icon: ShieldAlert,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-200 dark:border-red-800',
    label: 'Critical',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800',
    label: 'Warning',
  },
  info: {
    icon: Info,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
    label: 'Info',
  },
  positive: {
    icon: CheckCircle2,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    borderColor: 'border-green-200 dark:border-green-800',
    label: 'Good',
  },
};

function getRiskScoreColor(score: number): string {
  if (score <= 30) return 'text-green-600';
  if (score <= 60) return 'text-amber-600';
  return 'text-red-600';
}

function getRiskScoreLabel(score: number): string {
  if (score <= 30) return 'Low Risk';
  if (score <= 60) return 'Moderate Risk';
  return 'High Risk';
}

// --- Sub-components ---

function RiskScoreGauge({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;
  const color = score <= 30 ? '#22c55e' : score <= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="100" height="100" className="-rotate-90">
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted/20"
        />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cn('text-xl font-bold', getRiskScoreColor(score))}>{score}</span>
        <span className="text-[10px] text-muted-foreground">/100</span>
      </div>
    </div>
  );
}

function FindingCard({
  finding,
  isActive,
  onClick,
  onApplyRecommendation,
  decision = 'pending',
  onDecision,
}: {
  finding: AnalysisFinding;
  isActive: boolean;
  onClick: () => void;
  onApplyRecommendation?: (findingId: string, newText: string) => void;
  decision?: FindingDecision;
  onDecision?: (findingId: string, decision: FindingDecision) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(finding.recommendation || '');
  const config = severityConfig[finding.severity];
  const Icon = config.icon;

  const hasRecommendation = !!finding.recommendation && !!finding.matchText;

  return (
    <div
      className={cn(
        'rounded-lg border transition-all cursor-pointer',
        config.borderColor,
        decision === 'accepted' &&
          'bg-green-50/50 dark:bg-green-950/20 border-green-300 dark:border-green-700',
        decision === 'rejected' && 'opacity-50',
        isActive && decision === 'pending' && cn(config.bgColor, 'ring-2 ring-primary/30'),
        decision === 'pending' && !isActive && 'hover:bg-accent/50'
      )}
      onClick={onClick}
    >
      <div className="p-3">
        <div className="flex items-start gap-2">
          {decision === 'accepted' ? (
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
          ) : decision === 'rejected' ? (
            <X className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          ) : (
            <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', config.color)} />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4
                className={cn(
                  'text-sm font-medium truncate',
                  decision === 'rejected' && 'line-through text-muted-foreground'
                )}
              >
                {finding.title}
              </h4>
              <div className="flex items-center gap-1 shrink-0">
                {decision !== 'pending' && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] px-1.5 py-0',
                      decision === 'accepted'
                        ? 'text-green-600 border-green-300'
                        : 'text-muted-foreground border-muted'
                    )}
                  >
                    {decision === 'accepted' ? 'Accepted' : 'Dismissed'}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={cn('text-[10px] px-1.5 py-0', config.color, config.borderColor)}
                >
                  {config.label}
                </Badge>
              </div>
            </div>
            {finding.section && (
              <p className="text-xs text-muted-foreground mt-0.5">{finding.section}</p>
            )}
          </div>
        </div>

        {/* Accept/Reject buttons — always visible for findings with recommendations */}
        {hasRecommendation && decision === 'pending' && (
          <div className="flex gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              className="h-7 text-xs px-3 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => onDecision?.(finding.id, 'accepted')}
            >
              <ThumbsUp className="h-3 w-3 mr-1.5" />
              Accept Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-3"
              onClick={() => onDecision?.(finding.id, 'rejected')}
            >
              <ThumbsDown className="h-3 w-3 mr-1.5" />
              Dismiss
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs px-2"
              onClick={() => {
                setIsEditing(true);
                setEditText(finding.recommendation || '');
                setIsExpanded(true);
              }}
            >
              <Edit3 className="h-3 w-3 mr-1" />
              Edit
            </Button>
          </div>
        )}

        {/* Undo button for already decided findings */}
        {decision !== 'pending' && (
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] px-2 text-muted-foreground"
              onClick={() => onDecision?.(finding.id, 'pending')}
            >
              <Undo2 className="h-3 w-3 mr-1" />
              Undo
            </Button>
          </div>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="flex items-center gap-1 text-xs text-muted-foreground mt-1 hover:text-foreground transition-colors"
        >
          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {isExpanded ? 'Less' : 'Details'}
        </button>

        {isExpanded && (
          <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs text-muted-foreground leading-relaxed">{finding.description}</p>

            {finding.matchText && (
              <div className="rounded bg-muted/50 p-2 border-l-2 border-muted-foreground/30">
                <p className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                  Flagged Text
                </p>
                <p className="text-xs italic">
                  "{finding.matchText.substring(0, 200)}
                  {finding.matchText.length > 200 ? '...' : ''}"
                </p>
              </div>
            )}

            {finding.recommendation && (
              <div
                className={cn(
                  'rounded p-2 border-l-2',
                  decision === 'accepted'
                    ? 'bg-green-50 dark:bg-green-950/30 border-green-400'
                    : 'bg-primary/5 border-primary/30'
                )}
              >
                <p className="text-[10px] font-medium text-primary mb-1 uppercase tracking-wider">
                  {decision === 'accepted' ? 'Accepted Recommendation' : 'Recommendation'}
                </p>
                <p className="text-xs">{finding.recommendation}</p>
              </div>
            )}

            {isEditing && (
              <div className="space-y-2">
                <Textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="text-xs min-h-[60px]"
                  placeholder="Edit the recommendation text..."
                />
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    className="h-6 text-[10px] px-2 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => {
                      if (editText.trim()) {
                        onApplyRecommendation?.(finding.id, editText.trim());
                        onDecision?.(finding.id, 'accepted');
                        setIsEditing(false);
                      }
                    }}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Accept with Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setIsEditing(false)}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Document text formatter ---

/**
 * Renders extracted document text with proper formatting:
 * - Detects section headings (numbered sections, ALL CAPS lines)
 * - Adds paragraph spacing between blocks
 * - Preserves numbered/lettered list structure
 */
function FormattedDocumentText({ text }: { text: string }) {
  if (!text) return null;

  const paragraphs = text.split(/\n{2,}|\r\n\r\n/);

  if (paragraphs.length <= 1) {
    // Single block — try to split on single newlines or detect run-on sections
    const lines = text.split(/\n/);
    if (lines.length <= 1) {
      // Truly flat text — try to split on sentence boundaries near section patterns
      const sections = text.split(
        /(?=(?:^|\s)(?:\d+\.(?:\d+\.?)*\s|ARTICLE\s|SECTION\s|CLAUSE\s|SCHEDULE\s|EXHIBIT\s|APPENDIX\s))/i
      );
      if (sections.length > 1) {
        return (
          <>
            {sections.map((section, i) => (
              <span key={i}>
                {i > 0 && <span className="block mt-4" />}
                <DocumentLine text={section.trim()} />
              </span>
            ))}
          </>
        );
      }
      return <span className="whitespace-pre-wrap">{text}</span>;
    }

    return (
      <>
        {lines.map((line, i) => (
          <span key={i}>
            {i > 0 && <br />}
            <DocumentLine text={line} />
          </span>
        ))}
      </>
    );
  }

  return (
    <>
      {paragraphs.map((para, i) => (
        <span key={i} className="block mb-3">
          <DocumentLine text={para.trim()} />
        </span>
      ))}
    </>
  );
}

function DocumentLine({ text }: { text: string }) {
  if (!text) return null;

  // Section headings: "1. TITLE", "ARTICLE I", "SECTION 4.2", all-caps lines
  const isHeading =
    /^(?:\d+\.(?:\d+\.?)*\s+[A-Z])/.test(text) ||
    /^(?:ARTICLE|SECTION|CLAUSE|SCHEDULE|EXHIBIT|APPENDIX)\s/i.test(text) ||
    (text.length < 80 && text === text.toUpperCase() && /[A-Z]/.test(text));

  if (isHeading) {
    const headingText = text.split('\n')[0];
    const rest = text.slice(headingText.length).trim();
    return (
      <>
        <span className="block font-semibold text-foreground mt-4 mb-1">{headingText}</span>
        {rest && <span className="whitespace-pre-wrap">{rest}</span>}
      </>
    );
  }

  return <span className="whitespace-pre-wrap">{text}</span>;
}

// --- Document viewer with highlights ---

function HighlightedDocument({
  content,
  findings,
  activeFindingId,
  onSelectFinding,
  editableContent,
  onEditContent,
}: {
  content: string;
  findings: AnalysisFinding[];
  activeFindingId: string | null;
  onSelectFinding: (id: string) => void;
  editableContent?: string;
  onEditContent?: (content: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDocEditing, setIsDocEditing] = useState(false);
  const [localContent, setLocalContent] = useState(content);

  useEffect(() => {
    setLocalContent(editableContent || content);
  }, [editableContent, content]);

  // Build highlighted segments from findings
  const highlightedContent = useMemo(() => {
    if (!content || findings.length === 0) return null;

    // Find all match positions
    type MatchInfo = { start: number; end: number; findingId: string; severity: FindingSeverity };
    const matches: MatchInfo[] = [];

    findings.forEach((finding) => {
      if (!finding.matchText || finding.matchText.length < 3) return;
      // Search for the match text in the document - use first occurrence
      const searchText = finding.matchText.substring(0, 150); // Limit search length
      const index = content.indexOf(searchText);
      if (index !== -1) {
        matches.push({
          start: index,
          end: index + searchText.length,
          findingId: finding.id,
          severity: finding.severity,
        });
      }
    });

    // Sort by start position
    matches.sort((a, b) => a.start - b.start);

    // Remove overlaps (keep earlier ones)
    const filtered: MatchInfo[] = [];
    let lastEnd = 0;
    for (const match of matches) {
      if (match.start >= lastEnd) {
        filtered.push(match);
        lastEnd = match.end;
      }
    }

    // Build segments
    const segments: Array<{
      text: string;
      match?: MatchInfo;
    }> = [];

    let pos = 0;
    for (const match of filtered) {
      if (match.start > pos) {
        segments.push({ text: content.substring(pos, match.start) });
      }
      segments.push({
        text: content.substring(match.start, match.end),
        match,
      });
      pos = match.end;
    }
    if (pos < content.length) {
      segments.push({ text: content.substring(pos) });
    }

    return segments;
  }, [content, findings]);

  // Scroll to active highlight — works inside ScrollArea viewport
  useEffect(() => {
    if (activeFindingId && containerRef.current) {
      const safeId = CSS.escape(activeFindingId);
      const el = containerRef.current.querySelector(`[data-finding-id="${safeId}"]`) as HTMLElement;
      if (el) {
        // Find the ScrollArea viewport (parent with overflow)
        const viewport = containerRef.current.closest('[data-radix-scroll-area-viewport]');
        if (viewport) {
          const elRect = el.getBoundingClientRect();
          const viewportRect = viewport.getBoundingClientRect();
          const offset =
            elRect.top - viewportRect.top - viewportRect.height / 2 + elRect.height / 2;
          viewport.scrollBy({ top: offset, behavior: 'smooth' });
        } else {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Brief flash effect to draw attention
        el.classList.add('animate-pulse');
        setTimeout(() => el.classList.remove('animate-pulse'), 1500);
      }
    }
  }, [activeFindingId]);

  const highlightColorMap: Record<FindingSeverity, string> = {
    critical: 'bg-red-200/60 dark:bg-red-900/40 border-b-2 border-red-400',
    warning: 'bg-amber-200/60 dark:bg-amber-900/40 border-b-2 border-amber-400',
    info: 'bg-blue-200/60 dark:bg-blue-900/40 border-b-2 border-blue-400',
    positive: 'bg-green-200/60 dark:bg-green-900/40 border-b-2 border-green-400',
  };

  const activeHighlightColorMap: Record<FindingSeverity, string> = {
    critical: 'bg-red-300/80 dark:bg-red-800/60 ring-2 ring-red-400',
    warning: 'bg-amber-300/80 dark:bg-amber-800/60 ring-2 ring-amber-400',
    info: 'bg-blue-300/80 dark:bg-blue-800/60 ring-2 ring-blue-400',
    positive: 'bg-green-300/80 dark:bg-green-800/60 ring-2 ring-green-400',
  };

  if (isDocEditing) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
          <span className="text-xs font-medium">Editing Document</span>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setIsDocEditing(false)}
            >
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                onEditContent?.(localContent);
                setIsDocEditing(false);
              }}
            >
              <Check className="h-3 w-3 mr-1" />
              Save Changes
            </Button>
          </div>
        </div>
        <Textarea
          value={localContent}
          onChange={(e) => setLocalContent(e.target.value)}
          className="flex-1 rounded-none border-0 resize-none text-sm leading-relaxed font-mono focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium">Document</span>
          {findings.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {findings.length} findings highlighted
            </Badge>
          )}
        </div>
        <div className="flex gap-1.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => navigator.clipboard.writeText(content)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy document</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {onEditContent && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setIsDocEditing(true)}
            >
              <Edit3 className="h-3 w-3 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div
          ref={containerRef}
          className="px-6 py-4 text-sm leading-relaxed font-[system-ui] contract-document"
        >
          {highlightedContent ? (
            highlightedContent.map((segment, i) =>
              segment.match ? (
                <TooltipProvider key={i}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <mark
                        data-finding-id={segment.match.findingId}
                        className={cn(
                          'cursor-pointer rounded-sm px-0.5 transition-all inline',
                          activeFindingId === segment.match.findingId
                            ? activeHighlightColorMap[segment.match.severity]
                            : highlightColorMap[segment.match.severity]
                        )}
                        onClick={() => onSelectFinding(segment.match!.findingId)}
                      >
                        {segment.text}
                      </mark>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-xs">
                        {findings.find((f) => f.id === segment.match!.findingId)?.title}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <FormattedDocumentText key={i} text={segment.text} />
              )
            )
          ) : (
            <FormattedDocumentText text={content} />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// --- Main Component ---

export function ContractAnalysisView({
  documentContent,
  documentTitle,
  findings,
  recap,
  isAnalyzing,
  onApplyRecommendation,
  onEditDocument,
  onExport,
  decisions: externalDecisions,
  onDecision: externalOnDecision,
}: ContractAnalysisViewProps) {
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('findings');
  const [filterSeverity, setFilterSeverity] = useState<FindingSeverity | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [internalDecisions, setInternalDecisions] = useState<Record<string, FindingDecision>>({});
  const findingsRef = useRef<HTMLDivElement>(null);

  const decisions = externalDecisions || internalDecisions;
  const handleDecision = useCallback(
    (findingId: string, decision: FindingDecision) => {
      if (externalOnDecision) {
        externalOnDecision(findingId, decision);
      } else {
        setInternalDecisions((prev) => ({ ...prev, [findingId]: decision }));
      }
    },
    [externalOnDecision]
  );

  const actionableFindings = findings.filter((f) => f.recommendation && f.matchText);
  const acceptedCount = actionableFindings.filter((f) => decisions[f.id] === 'accepted').length;
  const rejectedCount = actionableFindings.filter((f) => decisions[f.id] === 'rejected').length;
  const pendingCount = actionableFindings.length - acceptedCount - rejectedCount;

  const filteredFindings = findings.filter((f) => {
    if (filterSeverity !== 'all' && f.severity !== filterSeverity) return false;
    if (filterCategory !== 'all' && f.category !== filterCategory) return false;
    return true;
  });

  const categories = useMemo(() => [...new Set(findings.map((f) => f.category))], [findings]);

  const handleSelectFinding = useCallback((id: string) => {
    setActiveFindingId(id);
    setActiveTab('findings');
    // Scroll finding card into view
    setTimeout(() => {
      const safeId = CSS.escape(id);
      const el = findingsRef.current?.querySelector(`[data-finding-card="${safeId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }, []);

  const handleApply = useCallback(
    (findingId: string, newText: string) => {
      onApplyRecommendation?.(findingId, newText);
    },
    [onApplyRecommendation]
  );

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10">
            <Sparkles className="h-4.5 w-4.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate">{documentTitle}</h2>
            <p className="text-xs text-muted-foreground">
              REAM AI Contract Analysis
              {recap.totalFindings > 0 && (
                <span className="ml-1">
                  &middot; {recap.totalFindings} finding{recap.totalFindings !== 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {recap.riskScore > 0 && (
            <Badge
              variant="outline"
              className={cn('text-xs font-semibold', getRiskScoreColor(recap.riskScore))}
            >
              {getRiskScoreLabel(recap.riskScore)}
            </Badge>
          )}
          {onExport && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onExport}>
              Export
            </Button>
          )}
        </div>
      </div>

      {/* Main split pane */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        {/* Left: Document with highlights */}
        <ResizablePanel defaultSize={55} minSize={30}>
          <HighlightedDocument
            content={documentContent}
            findings={findings}
            activeFindingId={activeFindingId}
            onSelectFinding={handleSelectFinding}
            onEditContent={onEditDocument}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right: Findings panel */}
        <ResizablePanel defaultSize={45} minSize={25}>
          <div className="flex flex-col h-full">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
              <div className="border-b px-3 pt-2">
                <TabsList className="h-9 w-full">
                  <TabsTrigger value="recap" className="flex-1 text-xs gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5" />
                    Recap
                  </TabsTrigger>
                  <TabsTrigger value="findings" className="flex-1 text-xs gap-1.5">
                    <List className="h-3.5 w-3.5" />
                    Findings
                    {findings.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] ml-1 px-1.5 py-0 h-4">
                        {findings.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Recap Tab */}
              <TabsContent value="recap" className="flex-1 m-0 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-5">
                    {/* Risk score */}
                    <div className="flex items-center gap-4">
                      <RiskScoreGauge score={recap.riskScore} />
                      <div>
                        <p className={cn('text-lg font-bold', getRiskScoreColor(recap.riskScore))}>
                          {getRiskScoreLabel(recap.riskScore)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Risk Score: {recap.riskScore}/100
                        </p>
                      </div>
                    </div>

                    {/* Finding counts */}
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {
                          label: 'Critical',
                          count: recap.criticalCount,
                          severity: 'critical' as FindingSeverity,
                        },
                        {
                          label: 'Warnings',
                          count: recap.warningCount,
                          severity: 'warning' as FindingSeverity,
                        },
                        {
                          label: 'Info',
                          count: recap.infoCount,
                          severity: 'info' as FindingSeverity,
                        },
                        {
                          label: 'Positive',
                          count: recap.positiveCount,
                          severity: 'positive' as FindingSeverity,
                        },
                      ].map(({ label, count, severity }) => {
                        const config = severityConfig[severity];
                        const Icon = config.icon;
                        return (
                          <button
                            key={severity}
                            type="button"
                            onClick={() => {
                              setFilterSeverity(severity);
                              setActiveTab('findings');
                            }}
                            className={cn(
                              'flex items-center gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-accent/50',
                              config.borderColor
                            )}
                          >
                            <Icon className={cn('h-4 w-4', config.color)} />
                            <div>
                              <p className="text-lg font-bold leading-none">{count}</p>
                              <p className="text-xs text-muted-foreground">{label}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Summary */}
                    <div>
                      <h3 className="text-sm font-semibold mb-2">Executive Summary</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {recap.summary}
                      </p>
                    </div>

                    {/* Categories */}
                    {recap.categories.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Categories Analyzed</h3>
                        <div className="flex flex-wrap gap-1.5">
                          {recap.categories.map((cat) => (
                            <Badge
                              key={cat}
                              variant="outline"
                              className="text-xs cursor-pointer hover:bg-accent"
                              onClick={() => {
                                setFilterCategory(cat);
                                setActiveTab('findings');
                              }}
                            >
                              {cat}
                              <ArrowRight className="h-3 w-3 ml-1" />
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* View all findings CTA */}
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setActiveTab('findings')}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View All {findings.length} Findings
                    </Button>
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Findings Tab */}
              <TabsContent value="findings" className="flex-1 m-0 overflow-hidden flex flex-col">
                {/* Filters */}
                <div className="flex items-center gap-2 px-3 py-2 border-b overflow-x-auto">
                  <span className="text-xs text-muted-foreground shrink-0">Filter:</span>
                  <div className="flex gap-1">
                    <Badge
                      variant={filterSeverity === 'all' ? 'default' : 'outline'}
                      className="text-[10px] cursor-pointer shrink-0"
                      onClick={() => setFilterSeverity('all')}
                    >
                      All ({findings.length})
                    </Badge>
                    {(['critical', 'warning', 'info', 'positive'] as FindingSeverity[]).map(
                      (sev) => {
                        const count = findings.filter((f) => f.severity === sev).length;
                        if (count === 0) return null;
                        const config = severityConfig[sev];
                        return (
                          <Badge
                            key={sev}
                            variant={filterSeverity === sev ? 'default' : 'outline'}
                            className={cn(
                              'text-[10px] cursor-pointer shrink-0',
                              filterSeverity !== sev && config.color
                            )}
                            onClick={() => setFilterSeverity(filterSeverity === sev ? 'all' : sev)}
                          >
                            {config.label} ({count})
                          </Badge>
                        );
                      }
                    )}
                  </div>
                </div>
                {categories.length > 1 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b overflow-x-auto">
                    <span className="text-xs text-muted-foreground shrink-0">Category:</span>
                    <div className="flex gap-1">
                      <Badge
                        variant={filterCategory === 'all' ? 'default' : 'outline'}
                        className="text-[10px] cursor-pointer shrink-0"
                        onClick={() => setFilterCategory('all')}
                      >
                        All
                      </Badge>
                      {categories.map((cat) => (
                        <Badge
                          key={cat}
                          variant={filterCategory === cat ? 'default' : 'outline'}
                          className="text-[10px] cursor-pointer shrink-0"
                          onClick={() => setFilterCategory(filterCategory === cat ? 'all' : cat)}
                        >
                          {cat}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Decisions summary bar */}
                {actionableFindings.length > 0 && (
                  <div className="flex items-center gap-3 px-3 py-2 border-b bg-muted/20">
                    <span className="text-xs text-muted-foreground shrink-0">Review:</span>
                    <div className="flex items-center gap-2 text-xs">
                      {acceptedCount > 0 && (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="h-3 w-3" />
                          {acceptedCount} accepted
                        </span>
                      )}
                      {rejectedCount > 0 && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <X className="h-3 w-3" />
                          {rejectedCount} dismissed
                        </span>
                      )}
                      {pendingCount > 0 && (
                        <span className="flex items-center gap-1 text-amber-600">
                          {pendingCount} pending
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Findings list */}
                <ScrollArea className="flex-1">
                  <div ref={findingsRef} className="p-3 space-y-2">
                    {isAnalyzing && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 animate-pulse">
                        <Sparkles className="h-4 w-4 text-primary animate-spin" />
                        <span className="text-sm text-muted-foreground">Analyzing document...</span>
                      </div>
                    )}
                    {filteredFindings.length === 0 && !isAnalyzing ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <CheckCircle2 className="h-8 w-8 text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">
                          {filterSeverity !== 'all' || filterCategory !== 'all'
                            ? 'No findings match the current filters'
                            : 'No findings to display'}
                        </p>
                      </div>
                    ) : (
                      filteredFindings.map((finding) => (
                        <div key={finding.id} data-finding-card={finding.id}>
                          <FindingCard
                            finding={finding}
                            isActive={activeFindingId === finding.id}
                            onClick={() => {
                              const newId = activeFindingId === finding.id ? null : finding.id;
                              setActiveFindingId(newId);
                            }}
                            onApplyRecommendation={handleApply}
                            decision={decisions[finding.id] || 'pending'}
                            onDecision={handleDecision}
                          />
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

// --- Utility: Parse AI analysis into structured findings ---

/**
 * Parses raw AI analysis text into structured findings.
 * The AI is prompted to return structured data, but this also handles
 * free-form analysis text with pattern matching.
 */
export function parseAnalysisToFindings(
  analysisText: string,
  documentContent: string
): { findings: AnalysisFinding[]; recap: AnalysisRecap } {
  const findings: AnalysisFinding[] = [];
  let findingIdCounter = 0;

  // Try to parse as JSON first (if AI returns structured data)
  try {
    const jsonMatch =
      analysisText.match(/```json\s*([\s\S]*?)\s*```/) ||
      analysisText.match(/```\s*(\{[\s\S]*?\})\s*```/);
    const rawJson = jsonMatch ? jsonMatch[1] : analysisText.trim();
    const parsed = JSON.parse(rawJson);
    if (parsed) {
      if (parsed.findings && Array.isArray(parsed.findings)) {
        const parsedFindings = parsed.findings.map(
          (f: {
            severity?: string;
            title?: string;
            description?: string;
            matchText?: string;
            quote?: string;
            recommendation?: string;
            suggestion?: string;
            section?: string;
            category?: string;
          }) => ({
            id: `finding-${findingIdCounter++}`,
            severity: (['critical', 'warning', 'info', 'positive'].includes(f.severity || '')
              ? f.severity
              : 'info') as FindingSeverity,
            title: f.title || 'Finding',
            description: f.description || '',
            matchText: f.matchText || f.quote || '',
            recommendation: f.recommendation || f.suggestion,
            section: f.section,
            category: f.category || 'General',
          })
        );

        const recap = buildRecap(parsedFindings, parsed.summary || '', parsed.riskScore);
        return { findings: parsedFindings, recap };
      }
    }
  } catch {
    // Fall through to pattern matching
  }

  // Pattern match common analysis structures
  const lines = analysisText.split('\n');
  let currentCategory = 'General';
  let currentSeverity: FindingSeverity = 'info';
  const summaryLines: string[] = [];
  let inSummary = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Detect category headers (## Risk Analysis, **Liability**, etc.)
    const headerMatch = line.match(/^#{1,3}\s+(.+)$/) || line.match(/^\*\*(.+?)\*\*\s*$/);
    if (headerMatch) {
      const header = headerMatch[1].toLowerCase();
      if (
        header.includes('summary') ||
        header.includes('overview') ||
        header.includes('executive')
      ) {
        inSummary = true;
        continue;
      }
      inSummary = false;
      currentCategory = headerMatch[1].replace(/[*#]/g, '').trim();

      // Infer severity from category name
      if (
        header.includes('critical') ||
        header.includes('high risk') ||
        header.includes('severe')
      ) {
        currentSeverity = 'critical';
      } else if (
        header.includes('risk') ||
        header.includes('warning') ||
        header.includes('concern') ||
        header.includes('issue')
      ) {
        currentSeverity = 'warning';
      } else if (
        header.includes('positive') ||
        header.includes('strength') ||
        header.includes('good') ||
        header.includes('compliant')
      ) {
        currentSeverity = 'positive';
      } else {
        currentSeverity = 'info';
      }
      continue;
    }

    if (inSummary) {
      summaryLines.push(line);
      continue;
    }

    // Detect findings (bullet points, numbered items)
    const bulletMatch = line.match(/^[-*•]\s+(.+)/) || line.match(/^\d+[.)]\s+(.+)/);
    if (bulletMatch) {
      const text = bulletMatch[1];

      // Try to find a quoted section
      const quoteMatch = text.match(/"([^"]+)"/) || text.match(/'([^']+)'/);
      let matchText = '';

      if (quoteMatch) {
        matchText = quoteMatch[1];
      } else {
        // Try to find a matching phrase in the document
        const words = text.split(/\s+/).slice(0, 8).join(' ');
        if (words.length > 10 && documentContent.includes(words)) {
          matchText = words;
        }
      }

      // Extract recommendation if present (after "Recommendation:", "Should", "Consider")
      let recommendation = '';
      const recMatch = text.match(
        /(?:recommendation|suggest(?:ion)?|should|consider|advise)[:.]?\s*(.+)/i
      );
      if (recMatch) {
        recommendation = recMatch[1].trim();
      }

      // Check if next lines are a continuation or recommendation
      let description = text;
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1]?.trim();
        if (
          nextLine &&
          !nextLine.match(/^[-*•]\s/) &&
          !nextLine.match(/^\d+[.)]\s/) &&
          !nextLine.match(/^#{1,3}\s/)
        ) {
          description += ' ' + nextLine;
          const nextRecMatch = nextLine.match(
            /(?:recommendation|suggest(?:ion)?|should|consider)[:.]?\s*(.+)/i
          );
          if (nextRecMatch && !recommendation) {
            recommendation = nextRecMatch[1].trim();
          }
        }
      }

      // Detect severity from keywords in the text
      let severity = currentSeverity;
      const lowerText = text.toLowerCase();
      if (
        lowerText.includes('critical') ||
        lowerText.includes('dangerous') ||
        lowerText.includes('must be addressed') ||
        lowerText.includes('high risk')
      ) {
        severity = 'critical';
      } else if (
        lowerText.includes('risk') ||
        lowerText.includes('concern') ||
        lowerText.includes('unclear') ||
        lowerText.includes('ambiguous') ||
        lowerText.includes('missing')
      ) {
        severity = 'warning';
      } else if (
        lowerText.includes('well-drafted') ||
        lowerText.includes('standard') ||
        lowerText.includes('appropriate') ||
        lowerText.includes('compliant')
      ) {
        severity = 'positive';
      }

      // Extract a short title from the text
      const title = text.length > 60 ? text.substring(0, 57).replace(/\s+\S*$/, '') + '...' : text;

      findings.push({
        id: `finding-${findingIdCounter++}`,
        severity,
        title,
        description,
        matchText,
        recommendation: recommendation || undefined,
        category: currentCategory,
      });
    }
  }

  const summary = summaryLines.join('\n') || analysisText.substring(0, 300);
  const recap = buildRecap(findings, summary);

  return { findings, recap };
}

function buildRecap(
  findings: AnalysisFinding[],
  summary: string,
  riskScore?: number
): AnalysisRecap {
  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;
  const infoCount = findings.filter((f) => f.severity === 'info').length;
  const positiveCount = findings.filter((f) => f.severity === 'positive').length;

  // Calculate risk score if not provided
  const calculatedScore =
    riskScore ??
    Math.min(100, criticalCount * 25 + warningCount * 10 + infoCount * 2 - positiveCount * 5);

  return {
    summary,
    riskScore: Math.max(0, calculatedScore),
    totalFindings: findings.length,
    criticalCount,
    warningCount,
    infoCount,
    positiveCount,
    categories: [...new Set(findings.map((f) => f.category))],
  };
}
