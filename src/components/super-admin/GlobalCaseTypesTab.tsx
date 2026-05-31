import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAdminCapabilities } from '@/hooks/useAdminCapabilities';
import {
  useCreateGlobalCaseType,
  useDeleteGlobalCaseType,
  useGlobalCaseTypes,
  useUpdateGlobalCaseType,
  type GlobalCaseType,
} from '@/hooks/useGlobalCaseTypes';

interface FormState {
  name: string;
  description: string;
  is_active: boolean;
}

const emptyForm: FormState = { name: '', description: '', is_active: true };

export function GlobalCaseTypesTab() {
  const { data: caseTypes = [], isLoading } = useGlobalCaseTypes();
  const { has } = useAdminCapabilities();
  const canManage = has('superadmin');

  const createType = useCreateGlobalCaseType();
  const updateType = useUpdateGlobalCaseType();
  const deleteType = useDeleteGlobalCaseType();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (ct: GlobalCaseType) => {
    setEditingId(ct.id);
    setForm({ name: ct.name, description: ct.description ?? '', is_active: ct.is_active });
    setShowForm(true);
  };

  const submitForm = () => {
    if (!form.name.trim()) {
      window.alert('Please enter a name.');
      return;
    }
    const reason = window.prompt(
      editingId ? 'Reason for updating this case type:' : 'Reason for creating this case type:'
    );
    if (!reason || reason.trim().length < 3) return;

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      is_active: form.is_active,
      reason: reason.trim(),
    };

    if (editingId) {
      updateType.mutate({ id: editingId, ...payload }, { onSuccess: () => setShowForm(false) });
    } else {
      createType.mutate(payload, { onSuccess: () => setShowForm(false) });
    }
  };

  const toggleActive = (ct: GlobalCaseType) => {
    const reason = window.prompt(
      `Reason for ${ct.is_active ? 'deactivating' : 'activating'} "${ct.name}":`
    );
    if (!reason || reason.trim().length < 3) return;
    updateType.mutate({ id: ct.id, is_active: !ct.is_active, reason: reason.trim() });
  };

  const onDelete = (ct: GlobalCaseType) => {
    const reason = window.prompt(`Reason for deleting "${ct.name}":`);
    if (!reason || reason.trim().length < 3) return;
    deleteType.mutate({ id: ct.id, reason: reason.trim() });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Global Case Types</h2>
          <p className="text-muted-foreground">
            Matter types every firm sees in the case "Matter Type" dropdown.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New case type
          </Button>
        )}
      </div>

      {showForm && canManage && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">
              {editingId ? 'Edit case type' : 'Create case type'}
            </h3>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ct-name">Name</Label>
              <Input
                id="ct-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Litigation"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ct-description">Description</Label>
              <Textarea
                id="ct-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Short description shown to firms (optional)"
                rows={2}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="ct-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <Label htmlFor="ct-active">Active (visible to firms)</Label>
            </div>
            <div className="flex gap-2">
              <Button onClick={submitForm} disabled={createType.isPending || updateType.isPending}>
                {editingId ? 'Save changes' : 'Create case type'}
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
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : caseTypes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No global case types configured
            </div>
          ) : (
            <div className="space-y-2">
              {caseTypes.map((ct) => (
                <div
                  key={ct.id}
                  className="flex flex-col gap-3 p-4 border rounded-lg hover:bg-muted/50 md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{ct.name}</span>
                      {!ct.is_active && <Badge variant="destructive">Inactive</Badge>}
                    </div>
                    {ct.description && (
                      <div className="text-xs text-muted-foreground">{ct.description}</div>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={ct.is_active}
                        onCheckedChange={() => toggleActive(ct)}
                        aria-label="Toggle active"
                      />
                      <Button size="sm" variant="ghost" onClick={() => openEdit(ct)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(ct)}
                        disabled={deleteType.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
