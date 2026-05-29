import { useState, useEffect, useRef, useMemo } from 'react';
import Navigation from '@/components/ui/navigation';
import Footer from '@/components/sections/Footer';
import MouseFollowGlow from '@/components/ui/MouseFollowGlow';
import SEO from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  ArrowRight,
  ArrowLeft,
  Brain,
  CheckCircle,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileText,
  Lock,
  Mail,
  Search,
  Shield,
  Sparkles,
  Timer,
  Gavel,
  BarChart3,
  Send,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { postJson } from '@/lib/api';
import {
  questions,
  dimensions,
  tiers,
  calculateResults,
  getRecommendations,
  type Answers,
  type AssessmentResult,
  type DimensionKey,
} from '@/lib/assessment-data';

/* ────────────────────────────────────────────
   Animated Counter Hook (from Report.tsx pattern)
   ──────────────────────────────────────────── */
function useCountUp(end: number, duration = 1500, trigger = false) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!trigger) return;
    let startTime: number;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [trigger, end, duration]);

  return count;
}

/* ────────────────────────────────────────────
   Section: Assessment Hero
   ──────────────────────────────────────────── */
const AssessmentHero = ({ onStart }: { onStart: () => void }) => {
  const features = [
    { icon: Timer, text: 'Takes 2-3 minutes' },
    { icon: ClipboardCheck, text: '10 targeted questions' },
    { icon: BarChart3, text: 'Instant maturity score' },
    { icon: Sparkles, text: 'Personalized recommendations' },
  ];

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden bg-halftone">
      <div className="absolute inset-0 bg-dot-pattern"></div>
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/3 rounded-full blur-3xl"></div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-40 sm:pt-48 pb-16 sm:pb-24 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card/50 border border-border/50 backdrop-blur-sm mb-6 animate-fade-in">
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-xs sm:text-sm text-muted-foreground">Free Assessment</span>
        </div>

        <h1
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.15] mb-6 tracking-tight animate-fade-in"
          style={{ animationDelay: '0.1s' }}
        >
          How tech-ready is <span className="text-gradient">your practice?</span>
        </h1>

        <p
          className="text-base sm:text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed animate-fade-in"
          style={{ animationDelay: '0.2s' }}
        >
          Benchmark your firm's technology maturity across 6 key dimensions. Get your score, see how
          you compare, and receive tailored recommendations to level up.
        </p>

        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-2xl mx-auto mb-10 animate-fade-in"
          style={{ animationDelay: '0.3s' }}
        >
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.text}
                className="card-dark p-3 sm:p-4 flex flex-col items-center gap-2 text-center"
              >
                <Icon className="h-5 w-5 text-primary" />
                <span className="text-xs sm:text-sm text-muted-foreground">{f.text}</span>
              </div>
            );
          })}
        </div>

        <Button
          size="lg"
          className="btn-primary h-14 px-10 text-base group animate-fade-in"
          style={{ animationDelay: '0.4s' }}
          onClick={onStart}
        >
          Start Assessment
          <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
        </Button>

        <p
          className="text-xs text-muted-foreground mt-4 animate-fade-in"
          style={{ animationDelay: '0.45s' }}
        >
          Free &middot; No sign-up required &middot; Results in 2 minutes
        </p>
      </div>
    </section>
  );
};

/* ────────────────────────────────────────────
   Section: Question Step
   ──────────────────────────────────────────── */
const dimensionIcons: Record<DimensionKey, typeof Search> = {
  legal_research: Search,
  document_mgmt: FileText,
  court_filing: Gavel,
  ai_adoption: Brain,
  cybersecurity: Shield,
  practice_mgmt: BarChart3,
};

const QuestionStep = ({
  questionIndex,
  total,
  question,
  selectedScore,
  onSelect,
}: {
  questionIndex: number;
  total: number;
  question: (typeof questions)[0];
  selectedScore: number | null;
  onSelect: (score: number) => void;
}) => {
  const dim = dimensions.find((d) => d.key === question.dimension)!;
  const DimIcon = dimensionIcons[question.dimension];

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <DimIcon className="h-4 w-4 text-primary" />
        </div>
        <span className="text-xs text-muted-foreground font-medium">{dim.label}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {questionIndex + 1} of {total}
        </span>
      </div>

      <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-8 leading-tight">
        {question.question}
      </h2>

      <div className="space-y-3">
        {question.options.map((opt) => {
          const isSelected = selectedScore === opt.score;
          return (
            <button
              key={opt.score}
              onClick={() => onSelect(opt.score)}
              className={`w-full text-left p-4 sm:p-5 rounded-xl border transition-all duration-200 ${
                isSelected
                  ? 'border-primary bg-primary/10 shadow-glow'
                  : 'border-border/50 bg-card/30 hover:border-border hover:bg-muted/20'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                    isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                  }`}
                >
                  {isSelected && <div className="w-2 h-2 rounded-full bg-background"></div>}
                </div>
                <span
                  className={`text-sm sm:text-base leading-relaxed ${
                    isSelected ? 'text-foreground font-medium' : 'text-muted-foreground'
                  }`}
                >
                  {opt.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────
   Section: Assessment Wizard
   ──────────────────────────────────────────── */
const AssessmentWizard = ({ onComplete }: { onComplete: (answers: Answers) => void }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const total = questions.length;
  const currentQ = questions[currentStep];
  const selectedScore = answers[currentQ.id] ?? null;

  const handleSelect = (score: number) => {
    setAnswers((prev) => ({ ...prev, [currentQ.id]: score }));
  };

  const handleNext = () => {
    if (currentStep < total - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      onComplete(answers);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  const progressPercent = ((currentStep + (selectedScore ? 1 : 0)) / total) * 100;

  return (
    <section className="relative min-h-screen flex items-start justify-center overflow-hidden bg-background">
      <div className="absolute inset-0 bg-dot-pattern opacity-30"></div>
      <div className="relative z-10 w-full max-w-2xl mx-auto px-4 sm:px-6 pt-32 sm:pt-40 pb-16">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground font-medium">
              Question {currentStep + 1} of {total}
            </span>
            <span className="text-xs text-primary font-medium">{Math.round(progressPercent)}%</span>
          </div>
          <Progress value={progressPercent} className="h-2 bg-muted" />
        </div>

        {/* Question */}
        <div className="card-dark p-6 sm:p-8" key={currentQ.id}>
          <QuestionStep
            questionIndex={currentStep}
            total={total}
            question={currentQ}
            selectedScore={selectedScore}
            onSelect={handleSelect}
          />
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={currentStep === 0}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>

          <Button
            size="lg"
            className="btn-primary h-12 px-8 text-sm group"
            onClick={handleNext}
            disabled={selectedScore === null}
          >
            {currentStep === total - 1 ? 'See My Results' : 'Next'}
            <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </div>
    </section>
  );
};

/* ────────────────────────────────────────────
   Component: Radar Chart (Pure SVG)
   ──────────────────────────────────────────── */
const RadarChart = ({
  dimensionScores,
}: {
  dimensionScores: AssessmentResult['dimensionScores'];
}) => {
  const size = 280;
  const center = size / 2;
  const levels = 4;
  const radius = 110;

  const angleSlice = (Math.PI * 2) / dimensionScores.length;

  const getPoint = (index: number, value: number) => {
    const angle = angleSlice * index - Math.PI / 2;
    const r = (value / 4) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  const gridLevels = Array.from({ length: levels }, (_, i) => i + 1);
  const dataPoints = dimensionScores.map((ds, i) => getPoint(i, ds.score));
  const dataPath =
    dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[280px] mx-auto">
      {/* Grid */}
      {gridLevels.map((level) => {
        const points = dimensionScores
          .map((_, i) => {
            const p = getPoint(i, level);
            return `${p.x},${p.y}`;
          })
          .join(' ');
        return (
          <polygon
            key={level}
            points={points}
            fill="none"
            stroke="hsl(240 10% 18%)"
            strokeWidth="1"
            opacity={0.5}
          />
        );
      })}

      {/* Axes */}
      {dimensionScores.map((_, i) => {
        const p = getPoint(i, 4);
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={p.x}
            y2={p.y}
            stroke="hsl(240 10% 18%)"
            strokeWidth="1"
            opacity={0.5}
          />
        );
      })}

      {/* Data fill */}
      <path d={dataPath} fill="hsl(217 71% 73% / 0.2)" stroke="hsl(217 71% 73%)" strokeWidth="2" />

      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="4" fill="hsl(217 71% 73%)" />
      ))}

      {/* Labels */}
      {dimensionScores.map((ds, i) => {
        const angle = angleSlice * i - Math.PI / 2;
        const labelR = radius + 28;
        const x = center + labelR * Math.cos(angle);
        const y = center + labelR * Math.sin(angle);
        const dim = dimensions.find((d) => d.key === ds.key)!;
        return (
          <text
            key={ds.key}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted-foreground"
            fontSize="10"
            fontWeight="500"
          >
            {dim.shortLabel}
          </text>
        );
      })}
    </svg>
  );
};

/* ────────────────────────────────────────────
   Section: Assessment Results
   ──────────────────────────────────────────── */
const AssessmentResults = ({ answers }: { answers: Answers }) => {
  const { toast } = useToast();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
  });

  const result = useMemo(() => calculateResults(answers), [answers]);
  const recommendations = useMemo(
    () => getRecommendations(result.dimensionScores),
    [result.dimensionScores]
  );

  const animatedScore = useCountUp(result.totalScore, 1500, true);
  const animatedPercent = useCountUp(result.percent, 1500, true);

  const generateResultsPDF = (res: AssessmentResult, recs: Record<string, string[]>) => {
    const dimensionRows = res.dimensionScores
      .map(
        (ds) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${ds.label}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-align:right;font-weight:600;">${ds.percent}%</td>
        </tr>`
      )
      .join('');

    const recSections = res.dimensionScores
      .map((ds) => {
        const items = recs[ds.key];
        if (!items?.length) return '';
        return `
          <div style="margin-bottom:24px;">
            <h3 style="font-size:16px;font-weight:600;color:#0f172a;margin:0 0 8px;">${ds.label} <span style="font-size:12px;font-weight:400;color:#6b7280;">(${ds.percent}%)</span></h3>
            <ul style="margin:0;padding-left:20px;">
              ${items.map((r) => `<li style="font-size:14px;color:#374151;margin-bottom:6px;line-height:1.5;">${r}</li>`).join('')}
            </ul>
          </div>`;
      })
      .join('');

    const tierColor =
      { Explorer: '#f59e0b', Adopter: '#79a5ea', Leader: '#a78bfa', Innovator: '#22c55e' }[
        res.tier.name
      ] || '#79a5ea';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Kourti AI - Assessment Results</title>
      <style>
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 40px; color: #1e293b; max-width: 800px; margin: 0 auto; }
      </style></head><body>
      <div style="text-align:center;margin-bottom:32px;">
        <h1 style="font-size:24px;margin:0 0 4px;color:#0f172a;">KOURTI AI</h1>
        <p style="font-size:14px;color:#6b7280;margin:0;">Practice Technology Maturity Assessment</p>
      </div>
      <div style="text-align:center;margin-bottom:32px;padding:24px;background:#f8fafc;border-radius:12px;">
        <div style="font-size:48px;font-weight:700;color:#0f172a;margin-bottom:4px;">${res.totalScore}/${res.maxScore}</div>
        <div style="font-size:16px;color:#6b7280;margin-bottom:12px;">${res.percent}% Overall Score</div>
        <span style="display:inline-block;background:${tierColor};color:#fff;padding:6px 20px;border-radius:20px;font-size:14px;font-weight:600;">${res.tier.name}</span>
      </div>
      <h2 style="font-size:18px;color:#0f172a;margin-bottom:12px;">Score Breakdown</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;border-collapse:collapse;">
        <tr style="background:#f1f5f9;"><th style="padding:10px 12px;text-align:left;font-size:13px;color:#475569;">Dimension</th><th style="padding:10px 12px;text-align:right;font-size:13px;color:#475569;">Score</th></tr>
        ${dimensionRows}
      </table>
      <h2 style="font-size:18px;color:#0f172a;margin-bottom:16px;">Personalized Recommendations</h2>
      ${recSections}
      <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="font-size:12px;color:#9ca3af;">Kourti AI &middot; kourti.com</p>
      </div>
    </body></html>`;

    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 300);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const submitAssessment = async () => {
    setIsSubmitting(true);
    try {
      const dimScoresObj: Record<string, number> = {};
      result.dimensionScores.forEach((ds) => {
        dimScoresObj[ds.key] = ds.score;
      });

      await postJson('/api/v1/public/assessment', {
        ...formData,
        totalScore: result.totalScore,
        maxScore: result.maxScore,
        tier: result.tier.name,
        answers,
        dimensionScores: dimScoresObj,
      });

      setIsUnlocked(true);
      toast({
        title: 'Results unlocked!',
        description: "Your full report is ready. We've also sent a copy to your email.",
      });
    } catch {
      // Still unlock even if submission fails
      setIsUnlocked(true);
      toast({
        title: 'Results unlocked!',
        description: 'View your full breakdown below.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitAssessment();
  };

  return (
    <section className="relative min-h-screen bg-background">
      <div className="absolute inset-0 bg-dot-pattern opacity-30"></div>
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 pt-32 sm:pt-40 pb-16 sm:pb-24">
        {/* Score Header */}
        <div className="text-center mb-12 animate-fade-in">
          <div
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${result.tier.bgColor} border border-border/50 mb-6`}
          >
            <Sparkles className={`h-4 w-4 ${result.tier.color}`} />
            <span className={`text-sm font-semibold ${result.tier.color}`}>{result.tier.name}</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
            Your Maturity Score:{' '}
            <span className="text-gradient">
              {animatedScore}/{result.maxScore}
            </span>
          </h1>

          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto mb-2">
            {result.tier.description}
          </p>

          <div className="flex items-center justify-center gap-4 mt-6">
            <div className="card-dark px-6 py-3 text-center">
              <div className="text-2xl font-bold text-gradient">{animatedPercent}%</div>
              <div className="text-xs text-muted-foreground">Overall Score</div>
            </div>
            <div className="card-dark px-6 py-3 text-center">
              <div className={`text-2xl font-bold ${result.tier.color}`}>{result.tier.name}</div>
              <div className="text-xs text-muted-foreground">Your Tier</div>
            </div>
          </div>
        </div>

        {/* Radar Chart */}
        <div
          className="card-dark p-6 sm:p-8 mb-8 animate-fade-in"
          style={{ animationDelay: '0.1s' }}
        >
          <h3 className="text-lg font-semibold text-foreground mb-6 text-center">
            Your Technology Profile
          </h3>
          <RadarChart dimensionScores={result.dimensionScores} />

          {/* Dimension bars */}
          <div className="mt-8 space-y-4">
            {result.dimensionScores.map((ds) => (
              <div key={ds.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-foreground">{ds.label}</span>
                  <span className="text-sm text-muted-foreground">{ds.percent}%</span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-1000"
                    style={{ width: `${ds.percent}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gated Recommendations */}
        {!isUnlocked ? (
          <div className="relative animate-fade-in" style={{ animationDelay: '0.2s' }}>
            {/* Blurred preview */}
            <div
              className="card-dark p-6 sm:p-8 blur-sm select-none pointer-events-none"
              aria-hidden
            >
              <h3 className="text-lg font-semibold text-foreground mb-6">
                Personalized Recommendations
              </h3>
              {result.dimensionScores.slice(0, 3).map((ds) => (
                <div key={ds.key} className="mb-6">
                  <h4 className="text-sm font-semibold text-foreground mb-2">{ds.label}</h4>
                  <ul className="space-y-2">
                    <li className="text-sm text-muted-foreground flex gap-2">
                      <ChevronRight className="h-4 w-4 shrink-0 text-primary" />
                      Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod.
                    </li>
                    <li className="text-sm text-muted-foreground flex gap-2">
                      <ChevronRight className="h-4 w-4 shrink-0 text-primary" />
                      Ut enim ad minim veniam quis nostrud exercitation ullamco laboris.
                    </li>
                  </ul>
                </div>
              ))}
            </div>

            {/* Overlay form */}
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-xl">
              <div className="card-dark p-6 sm:p-8 max-w-md w-full mx-4 shadow-2xl border border-border/50">
                <div className="text-center mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Lock className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    Unlock Your Full Results
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Get personalized recommendations and a copy sent to your email.
                  </p>
                </div>

                <form onSubmit={handleUnlockSubmit} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      id="firstName"
                      placeholder="First Name *"
                      required
                      value={formData.firstName}
                      onChange={handleInputChange}
                    />
                    <Input
                      id="lastName"
                      placeholder="Last Name *"
                      required
                      value={formData.lastName}
                      onChange={handleInputChange}
                    />
                  </div>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Work Email *"
                    required
                    value={formData.email}
                    onChange={handleInputChange}
                  />
                  <Input
                    id="company"
                    placeholder="Firm / Organization (optional)"
                    value={formData.company}
                    onChange={handleInputChange}
                  />
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full btn-primary h-12 text-sm group"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Unlocking...' : 'Unlock Full Results'}
                    {!isSubmitting && (
                      <Send className="ml-2 h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                    )}
                  </Button>
                  <p className="text-[10px] text-muted-foreground text-center">
                    No spam. We'll send your results and recommendations to your email.
                  </p>
                </form>
              </div>
            </div>
          </div>
        ) : (
          /* Unlocked Recommendations */
          <div className="card-dark p-6 sm:p-8 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-[hsl(var(--success))]" />
                <h3 className="text-lg font-semibold text-foreground">
                  Your Personalized Recommendations
                </h3>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => generateResultsPDF(result, recommendations)}
              >
                <Download className="h-4 w-4" />
                Download PDF
              </Button>
            </div>

            <div className="space-y-8">
              {result.dimensionScores.map((ds) => {
                const recs = recommendations[ds.key];
                const DimIcon = dimensionIcons[ds.key];
                return (
                  <div key={ds.key}>
                    <div className="flex items-center gap-2 mb-3">
                      <DimIcon className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-semibold text-foreground">{ds.label}</h4>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ml-auto ${
                          ds.percent >= 75
                            ? 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]'
                            : ds.percent >= 50
                              ? 'bg-primary/10 text-primary'
                              : 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]'
                        }`}
                      >
                        {ds.percent}%
                      </span>
                    </div>
                    <ul className="space-y-2 pl-6">
                      {recs.map((rec, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex gap-2">
                          <ChevronRight className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CTA Section */}
        <div className="mt-12 text-center animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <div className="card-dark p-6 sm:p-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/80 to-primary/40"></div>
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Ready to level up your practice?
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-lg mx-auto">
              Kourti AI is purpose-built for Nigerian legal professionals. Research, draft, manage
              matters, and analyze performance -- all in one platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                className="btn-primary h-12 px-6 text-sm group"
                onClick={() => window.open('https://app.kourti.com', '_blank')}
              >
                Try Kourti AI Free
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button
                variant="outline"
                className="btn-secondary h-12 px-6 text-sm"
                onClick={() => window.open('/report/legaltech-nigeria-q1-2026', '_self')}
              >
                <Mail className="mr-2 h-4 w-4" />
                Read Our LegalTech Report
              </Button>
            </div>
          </div>
        </div>

        {/* Tier comparison */}
        <div
          className="mt-8 card-dark p-6 sm:p-8 animate-fade-in"
          style={{ animationDelay: '0.4s' }}
        >
          <h3 className="text-lg font-semibold text-foreground mb-6 text-center">
            Where do you stand?
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {tiers.map((t) => {
              const isCurrent = t.name === result.tier.name;
              return (
                <div
                  key={t.name}
                  className={`p-4 rounded-xl border text-center transition-all ${
                    isCurrent
                      ? 'border-primary bg-primary/5 shadow-glow'
                      : 'border-border/50 bg-card/30'
                  }`}
                >
                  <div
                    className={`text-lg font-bold mb-1 ${isCurrent ? t.color : 'text-muted-foreground'}`}
                  >
                    {t.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.range[0]}-{t.range[1]} pts
                  </div>
                  {isCurrent && (
                    <div className="mt-2 text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full inline-block">
                      YOU
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

/* ────────────────────────────────────────────
   Main Assessment Page
   ──────────────────────────────────────────── */
type Phase = 'hero' | 'quiz' | 'results';

const Assessment = () => {
  const [phase, setPhase] = useState<Phase>('hero');
  const [answers, setAnswers] = useState<Answers>({});

  const handleStart = () => {
    setPhase('quiz');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleComplete = (a: Answers) => {
    setAnswers(a);
    setPhase('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background relative">
      <SEO
        title="Practice Technology Maturity Assessment"
        description="Benchmark your law firm's technology maturity across 6 key dimensions. Take our free 2-minute assessment and get a personalised score with tailored recommendations."
        path="/assessment"
      />
      <MouseFollowGlow />
      <Navigation />
      <main className="relative z-10">
        {phase === 'hero' && <AssessmentHero onStart={handleStart} />}
        {phase === 'quiz' && <AssessmentWizard onComplete={handleComplete} />}
        {phase === 'results' && <AssessmentResults answers={answers} />}
      </main>
      <Footer />
    </div>
  );
};

export default Assessment;
