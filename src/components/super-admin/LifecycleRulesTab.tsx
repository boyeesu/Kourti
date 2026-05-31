import { useState } from 'react';
import { format } from 'date-fns';
import { Play, Plus, Trash2, Zap } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  TRIGGER_ACTIONS,
  useCreateRule,
  useDeleteRule,
  useLifecycleRules,
  useRunAllRules,
  useRunRule,
  useUpdateRule,
  type LifecycleAction,
  type LifecycleRule,
  type LifecycleTrigger,
} from '@/hooks/useLifecycleRules';

const TRIGGER_LABELS: Record<LifecycleTrigger, string> = {
  user_signup: 'User signup',
  dormant_account: 'Dormant account',
  trial_expiring: 'Trial expiring',
};

const ACTION_LABELS: Record<LifecycleAction, string> = {
  auto_approve: 'Auto-approve',
  flag: 'Flag',
  auto_disable: 'Auto-disable',
  notify: 'Notify',
};

const TRIGGERS = Object.keys(TRIGGER_ACTIONS) as LifecycleTrigger[];

interface FormState {
  name: string;
  trigger: LifecycleTrigger;
  action: LifecycleAction;
  domains: string; // comma-separated, user_signup only
  days: string; // dormant_account / trial_expiring
  enabled: boolean;
}

const emptyForm: FormState = {
  name: '',
  trigger: 'user_signup',
  action: 'auto_approve',
  domains: '',
  days: '90',
  enabled: true,
};

function paramsToForm(rule: LifecycleRule): FormState {
  const p = rule.params ?? {};
  const domains = Array.isArray(p.domains)
    ? (p.domains as unknown[]).filter((d): d is string => typeof d === 'string').join(', ')
    : '';
  const days = typeof p.days === 'number' ? String(p.days) : '';
  return {
    name: rule.name,
    trigger: rule.trigger,
    action: rule.action,
    domains,
    days: days || (rule.trigger === 'trial_expiring' ? '7' : '90'),
    enabled: rule.enabled,
  };
}

function buildParams(form: FormState): Record<string, unknown> {
  if (form.trigger === 'user_signup') {
    return {
      domains: form.domains
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean),
    };
  }
  return { days: Number(form.days) || 0 };
}

export function LifecycleRulesTab() {
  const { data: rules = [], isLoading } = useLifecycleRules();
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();
  const runRule = useRunRule();
  const runAll = useRunAllRules();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (rule: LifecycleRule) => {
    setEditingId(rule.id);
    setForm(paramsToForm(rule));
    setShowForm(true);
  };

  const onTriggerChange = (trigger: LifecycleTrigger) => {
    const allowed = TRIGGER_ACTIONS[trigger];
    setForm((f) => ({
      ...f,
      trigger,
      action: allowed.includes(f.action) ? f.action : allowed[0],
    }));
  };

  const submitForm = () => {
    if (!form.name.trim()) {
      window.alert('Please enter a rule name.');
      return;
    }
    const reason = window.prompt(
      editingId ? 'Reason for updating this rule:' : 'Reason for creating this rule:'
    );
    if (!reason || reason.trim().length < 3) return;

    const payload = {
      name: form.name.trim(),
      trigger: form.trigger,
      action: form.action,
      params: buildParams(form),
      enabled: form.enabled,
      reason: reason.trim(),
    };

    if (editingId) {
      updateRule.mutate({ id: editingId, ...payload }, { onSuccess: () => setShowForm(false) });
    } else {
      createRule.mutate(payload, { onSuccess: () => setShowForm(false) });
    }
  };

  const toggleEnabled = (rule: LifecycleRule) => {
    const reason = window.prompt(
      `Reason for ${rule.enabled ? 'disabling' : 'enabling'} "${rule.name}":`
    );
    if (!reason || reason.trim().length < 3) return;
    updateRule.mutate({ id: rule.id, enabled: !rule.enabled, reason: reason.trim() });
  };

  const onDelete = (rule: LifecycleRule) => {
    const reason = window.prompt(`Reason for deleting "${rule.name}":`);
    if (!reason || reason.trim().length < 3) return;
    deleteRule.mutate({ id: rule.id, reason: reason.trim() });
  };

  const onRun = (rule: LifecycleRule) => {
    const reason = window.prompt(`Reason for running "${rule.name}" now:`);
    if (!reason || reason.trim().length < 3) return;
    runRule.mutate({ id: rule.id, reason: reason.trim() });
  };

  const onRunAll = () => {
    const reason = window.prompt('Reason for running ALL enabled rules now:');
    if (!reason || reason.trim().length < 3) return;
    runAll.mutate({ reason: reason.trim() });
  };

  const allowedActions = TRIGGER_ACTIONS[form.trigger];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Lifecycle Automation Rules</h2>
          <p className="text-muted-foreground">
            Automate approvals, dormant-account handling, and trial reminders.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onRunAll} variant="outline" disabled={runAll.isPending}>
            <Zap className="h-4 w-4 mr-2" />
            Run all
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New rule
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">{editingId ? 'Edit rule' : 'Create rule'}</h3>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rule-name">Name</Label>
                <Input
                  id="rule-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Auto-approve @acme.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-trigger">Trigger</Label>
                <select
                  id="rule-trigger"
                  value={form.trigger}
                  onChange={(e) => onTriggerChange(e.target.value as LifecycleTrigger)}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                >
                  {TRIGGERS.map((t) => (
                    <option key={t} value={t}>
                      {TRIGGER_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-action">Action</Label>
                <select
                  id="rule-action"
                  value={form.action}
                  onChange={(e) => setForm({ ...form, action: e.target.value as LifecycleAction })}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                >
                  {allowedActions.map((a) => (
                    <option key={a} value={a}>
                      {ACTION_LABELS[a]}
                    </option>
                  ))}
                </select>
              </div>

              {form.trigger === 'user_signup' ? (
                <div className="space-y-2">
                  <Label htmlFor="rule-domains">Email domains (comma-separated)</Label>
                  <Input
                    id="rule-domains"
                    value={form.domains}
                    onChange={(e) => setForm({ ...form, domains: e.target.value })}
                    placeholder="acme.com, example.org"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="rule-days">
                    {form.trigger === 'dormant_account'
                      ? 'Inactive for at least (days)'
                      : 'Expiring within (days)'}
                  </Label>
                  <Input
                    id="rule-days"
                    type="number"
                    min={1}
                    value={form.days}
                    onChange={(e) => setForm({ ...form, days: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="rule-enabled"
                checked={form.enabled}
                onCheckedChange={(v) => setForm({ ...form, enabled: v })}
              />
              <Label htmlFor="rule-enabled">Enabled</Label>
            </div>

            <div className="flex gap-2">
              <Button onClick={submitForm} disabled={createRule.isPending || updateRule.isPending}>
                {editingId ? 'Save changes' : 'Create rule'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : rules.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No rules configured</div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex flex-col gap-3 p-4 border rounded-lg hover:bg-muted/50 md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{rule.name}</span>
                      <Badge variant="secondary">{TRIGGER_LABELS[rule.trigger]}</Badge>
                      <Badge variant="outline">{ACTION_LABELS[rule.action]}</Badge>
                      {!rule.enabled && <Badge variant="destructive">Disabled</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {rule.trigger === 'user_signup'
                        ? `Domains: ${
                            Array.isArray(rule.params?.domains)
                              ? (rule.params.domains as string[]).join(', ') || '—'
                              : '—'
                          }`
                        : `Days: ${typeof rule.params?.days === 'number' ? rule.params.days : '—'}`}
                      {' • Last run: '}
                      {rule.last_run_at
                        ? format(new Date(rule.last_run_at), 'MMM dd, yyyy HH:mm')
                        : 'never'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={() => toggleEnabled(rule)}
                        aria-label="Toggle enabled"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRun(rule)}
                      disabled={runRule.isPending}
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Run now
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(rule)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(rule)}
                      disabled={deleteRule.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
