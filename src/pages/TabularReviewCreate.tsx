import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDocuments } from '@/hooks/useDocuments';
import {
  createTabularReview,
  listPlaybookTemplates,
  type ColumnFormat,
  type TabularColumn,
  type PlaybookTemplate,
} from '@/lib/featuresApi';

const COLUMN_FORMATS: { value: ColumnFormat; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'bulleted_list', label: 'Bulleted list' },
  { value: 'number', label: 'Number' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'monetary_amount', label: 'Monetary amount' },
  { value: 'currency', label: 'Currency code' },
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'date', label: 'Date' },
  { value: 'tag', label: 'Tag (enum)' },
];

const STARTER_COLUMNS: TabularColumn[] = [
  { index: 0, name: 'Parties', description: 'All parties to the agreement', format: 'text' },
  {
    index: 1,
    name: 'Effective date',
    description: 'Date the agreement takes effect',
    format: 'date',
  },
  { index: 2, name: 'Governing law', description: 'Choice of law', format: 'text' },
];

export default function TabularReviewCreate() {
  const navigate = useNavigate();
  const { data: documents = [], isLoading: docsLoading } = useDocuments();

  const [title, setTitle] = useState('');
  const [practice, setPractice] = useState('');
  const [columns, setColumns] = useState<TabularColumn[]>(STARTER_COLUMNS);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [docFilter, setDocFilter] = useState('');

  const [templates, setTemplates] = useState<PlaybookTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>('');

  const [creating, setCreating] = useState(false);

  // Load tabular-kind playbook templates so the user can clone columns from
  // a saved preset.
  useEffect(() => {
    let cancelled = false;
    listPlaybookTemplates({ kind: 'tabular' })
      .then((rows) => {
        if (!cancelled) setTemplates(rows);
      })
      .catch(() => {
        // Silently — templates are optional.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredDocs = useMemo(() => {
    const q = docFilter.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) => (d.name ?? '').toLowerCase().includes(q));
  }, [documents, docFilter]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (!id) return;
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    if (tpl.title && !title) setTitle(tpl.title);
    if (tpl.practice && !practice) setPractice(tpl.practice);
    if (tpl.columns_config?.length) {
      setColumns(
        tpl.columns_config.map((c, i) => ({
          ...c,
          index: i,
          format: c.format ?? 'text',
        }))
      );
    }
  };

  const updateColumn = (idx: number, patch: Partial<TabularColumn>) => {
    setColumns((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const addColumn = () => {
    setColumns((prev) => [
      ...prev,
      { index: prev.length, name: '', description: '', format: 'text' },
    ]);
  };

  const removeColumn = (idx: number) => {
    setColumns((prev) => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, index: i })));
  };

  const toggleDoc = (id: string) => {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const validate = (): string | null => {
    if (!title.trim()) return 'Title is required';
    if (selectedDocs.size === 0) return 'Pick at least one document';
    if (columns.length === 0) return 'Add at least one column';
    for (const c of columns) {
      if (!c.name.trim()) return 'Every column needs a name';
      if (c.format === 'tag' && (!c.tags || c.tags.length === 0)) {
        return `Tag column "${c.name}" needs at least one tag option`;
      }
    }
    return null;
  };

  const handleCreate = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setCreating(true);
    try {
      const review = await createTabularReview({
        title: title.trim(),
        practice: practice.trim() || undefined,
        templateId: templateId || undefined,
        documentIds: Array.from(selectedDocs),
        columns: columns.map((c, i) => ({ ...c, index: i })),
      });
      toast.success('Tabular review created');
      navigate(`/tabular-reviews/${review.id}`);
    } catch (e) {
      toast.error('Create failed', {
        description: e instanceof Error ? e.message : 'Unknown error',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <PageContainer size="wide">
      <Breadcrumbs />
      <PageHeader
        title="New tabular review"
        description="Pick documents and columns. The AI will fill the spreadsheet with one extraction per cell."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Basics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Q2 loan covenant review"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="practice">Practice area</Label>
              <Input
                id="practice"
                value={practice}
                onChange={(e) => setPractice(e.target.value)}
                placeholder="Banking & Finance"
              />
            </div>
          </div>

          {templates.length > 0 && (
            <div className="space-y-1.5">
              <Label>Start from template (optional)</Label>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.title}
                      {tpl.is_system ? ' · built-in' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">2. Documents</CardTitle>
          <span className="text-xs text-muted-foreground">{selectedDocs.size} selected</span>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Filter documents…"
            value={docFilter}
            onChange={(e) => setDocFilter(e.target.value)}
            className="mb-3"
          />
          {docsLoading ? (
            <div className="text-xs text-muted-foreground">Loading documents…</div>
          ) : filteredDocs.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">
              No documents found. Upload some first.
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto border rounded-md divide-y">
              {filteredDocs.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggleDoc(d.id)}
                >
                  <Checkbox
                    checked={selectedDocs.has(d.id)}
                    onCheckedChange={() => toggleDoc(d.id)}
                  />
                  <span className="text-sm flex-1 truncate">{d.name}</span>
                  {d.contract_type && (
                    <span className="text-xs text-muted-foreground">{d.contract_type}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">3. Columns</CardTitle>
          <Button variant="outline" size="sm" onClick={addColumn}>
            <Plus className="h-3 w-3 mr-1" /> Add column
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {columns.map((col, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 border rounded-md p-3">
              <div className="md:col-span-3">
                <Label className="text-xs">Name</Label>
                <Input
                  value={col.name}
                  onChange={(e) => updateColumn(i, { name: e.target.value })}
                  placeholder="e.g. Maturity date"
                  className="text-sm"
                />
              </div>
              <div className="md:col-span-5">
                <Label className="text-xs">Description (helps the AI)</Label>
                <Input
                  value={col.description ?? ''}
                  onChange={(e) => updateColumn(i, { description: e.target.value })}
                  placeholder="Final maturity for the facility"
                  className="text-sm"
                />
              </div>
              <div className="md:col-span-3">
                <Label className="text-xs">Format</Label>
                <Select
                  value={col.format ?? 'text'}
                  onValueChange={(v) => updateColumn(i, { format: v as ColumnFormat })}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLUMN_FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-1 flex items-end justify-end">
                <Button variant="ghost" size="icon" onClick={() => removeColumn(i)} title="Remove">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {col.format === 'tag' && (
                <div className="md:col-span-12">
                  <Label className="text-xs">
                    Tag options (comma-separated, AI must pick exactly one)
                  </Label>
                  <Input
                    value={(col.tags ?? []).join(', ')}
                    onChange={(e) =>
                      updateColumn(i, {
                        tags: e.target.value
                          .split(',')
                          .map((t) => t.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="High, Medium, Low"
                    className="text-sm"
                  />
                </div>
              )}
              <div className="md:col-span-12">
                <Label className="text-xs">Custom prompt (optional)</Label>
                <Textarea
                  value={col.prompt ?? ''}
                  onChange={(e) => updateColumn(i, { prompt: e.target.value })}
                  rows={2}
                  className="text-sm"
                  placeholder="Extra instructions appended to the column extraction prompt"
                />
              </div>
            </div>
          ))}
          {columns.length === 0 && (
            <div className="text-xs text-muted-foreground italic">
              No columns. Add one to get started.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/tabular-reviews')}>
          Cancel
        </Button>
        <Button onClick={handleCreate} disabled={creating}>
          {creating ? 'Creating…' : 'Create review'}
        </Button>
      </div>
    </PageContainer>
  );
}
