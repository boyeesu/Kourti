import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { useGettingStarted, GETTING_STARTED_STEPS } from '@/hooks/useGettingStarted';
import {
  Sparkles,
  User,
  Users,
  Briefcase,
  FileText,
  FileCheck,
  Calendar,
  UserPlus,
  X,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, React.ReactNode> = {
  User: <User className="h-4 w-4" />,
  Users: <Users className="h-4 w-4" />,
  Briefcase: <Briefcase className="h-4 w-4" />,
  FileText: <FileText className="h-4 w-4" />,
  FileCheck: <FileCheck className="h-4 w-4" />,
  Calendar: <Calendar className="h-4 w-4" />,
  Sparkles: <Sparkles className="h-4 w-4" />,
  UserPlus: <UserPlus className="h-4 w-4" />,
};

export default function GettingStartedChecklist() {
  const navigate = useNavigate();
  const {
    showChecklist,
    isLoading,
    completedNames,
    completedCount,
    totalSteps,
    markStepComplete,
    dismissChecklist,
  } = useGettingStarted();
  const [collapsed, setCollapsed] = useState(false);

  if (!showChecklist || isLoading) return null;

  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Getting Started with Kourti</CardTitle>
              <CardDescription className="text-xs">
                Complete these steps to get the most out of your workspace
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={dismissChecklist}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-2">
          <Progress value={progressPercent} className="h-2 flex-1" />
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            {completedCount}/{totalSteps} complete
          </span>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="pt-0 pb-4">
          <div className="grid gap-1">
            {GETTING_STARTED_STEPS.map((step) => {
              const isComplete = completedNames.has(step.name);

              return (
                <div
                  key={step.name}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 transition-colors cursor-pointer group',
                    isComplete ? 'opacity-60' : 'hover:bg-primary/5'
                  )}
                  onClick={() => {
                    if (!isComplete) {
                      markStepComplete.mutate(step.name);
                    }
                    navigate(step.link);
                  }}
                >
                  <Checkbox
                    checked={isComplete}
                    onCheckedChange={(checked) => {
                      if (checked && !isComplete) {
                        markStepComplete.mutate(step.name);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                  />
                  <div
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-md shrink-0',
                      isComplete ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
                    )}
                  >
                    {ICON_MAP[step.icon]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'text-sm font-medium leading-tight',
                        isComplete && 'line-through text-muted-foreground'
                      )}
                    >
                      {step.title}
                    </p>
                    <p className="text-xs text-muted-foreground leading-tight">
                      {step.description}
                    </p>
                  </div>
                  <ArrowRight
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 transition-opacity',
                      isComplete
                        ? 'opacity-0'
                        : 'opacity-0 group-hover:opacity-100 text-muted-foreground'
                    )}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
