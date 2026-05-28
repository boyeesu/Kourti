import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Play, RefreshCw, Trash } from 'lucide-react';
import {
  getTabularReview,
  streamTabularGeneration,
  regenerateTabularCell,
  clearTabularReviewCells,
  type TabularReviewDetail as Detail,
  type TabularCell,
} from '@/lib/featuresApi';
import { toast } from 'sonner';
import { PageContainer } from '@/components/layout/PageContainer';

const FLAG_BG: Record<string, string> = {
  green: 'bg-green-500',
  grey: 'bg-gray-400',
  yellow: 'bg-amber-400',
  red: 'bg-red-500',
};

function cellKey(documentId: string, columnIndex: number) {
  return `${documentId}:${columnIndex}`;
}

// Strip [[page:N||quote:...]] citation markers so the cell summary is
// readable in tight spaces. Keep the wrapping bracket-tag form for tag
// columns ([[Yes]], [[USD]]) by stripping those separately.
function renderCellText(text: string): string {
  return text
    .replace(/\[\[page:\d+\|\|(?:quote:)?[^\]]*\]\]/gi, '')
    .replace(/\[\[([^\]|]+)\]\]/g, '$1')
    .trim();
}

export default function TabularReviewDetail() {
  const { reviewId = '' } = useParams<{ reviewId: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const cellsRef = useRef<Map<string, TabularCell>>(new Map());

  useEffect(() => {
    let cancelled = false;
    getTabularReview(reviewId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        cellsRef.current = new Map(d.cells.map((c) => [cellKey(c.document_id, c.column_index), c]));
      })
      .catch((err) => {
        toast.error('Failed to load review', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reviewId]);

  const cellMap = useMemo(() => {
    return new Map((detail?.cells ?? []).map((c) => [cellKey(c.document_id, c.column_index), c]));
  }, [detail]);

  const upsertCell = (cell: TabularCell) => {
    cellsRef.current.set(cellKey(cell.document_id, cell.column_index), cell);
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            cells: Array.from(cellsRef.current.values()),
          }
        : prev
    );
  };

  const handleGenerate = async () => {
    if (!detail) return;
    setGenerating(true);
    setProgress({ done: 0, total: 0 });
    // Mark every non-done cell as generating optimistically.
    cellsRef.current.forEach((cell, key) => {
      if (cell.status !== 'done') {
        cellsRef.current.set(key, { ...cell, status: 'generating', error_message: null });
      }
    });
    setDetail({ ...detail, cells: Array.from(cellsRef.current.values()) });
    try {
      let done = 0;
      for await (const event of streamTabularGeneration(reviewId)) {
        if (event.type === 'start') {
          setProgress({ done: 0, total: event.total });
        } else if (event.type === 'cell') {
          upsertCell(event.cell);
          done += 1;
          setProgress((p) => (p ? { ...p, done } : p));
        } else if (event.type === 'error') {
          toast.error('Cell generation error', { description: event.message });
        }
      }
    } catch (err) {
      toast.error('Generation failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleRegen = async (documentId: string, columnIndex: number) => {
    cellsRef.current.set(cellKey(documentId, columnIndex), {
      ...(cellsRef.current.get(cellKey(documentId, columnIndex)) as TabularCell),
      status: 'generating',
      error_message: null,
    });
    setDetail((prev) => (prev ? { ...prev, cells: Array.from(cellsRef.current.values()) } : prev));
    try {
      const updated = await regenerateTabularCell(reviewId, { documentId, columnIndex });
      upsertCell(updated);
    } catch (err) {
      toast.error('Regeneration failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  const handleClear = async () => {
    if (!confirm('Clear all cell contents?')) return;
    try {
      await clearTabularReviewCells(reviewId);
      cellsRef.current.forEach((cell, key) => {
        cellsRef.current.set(key, { ...cell, status: 'pending', content: null });
      });
      setDetail((prev) =>
        prev ? { ...prev, cells: Array.from(cellsRef.current.values()) } : prev
      );
    } catch (err) {
      toast.error('Clear failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  if (loading)
    return (
      <PageContainer>
        <div className="text-sm text-muted-foreground">Loading review…</div>
      </PageContainer>
    );
  if (!detail)
    return (
      <PageContainer>
        <div className="text-sm text-muted-foreground">Review not found.</div>
      </PageContainer>
    );

  const { review, columns, documents } = detail;

  return (
    <PageContainer>
      <Breadcrumbs />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            {review.title}
          </h1>
          <p className="text-xs text-muted-foreground">
            {documents.length} documents · {columns.length} columns
            {review.practice ? ` · ${review.practice}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleClear} disabled={generating}>
            <Trash className="h-4 w-4 mr-2" /> Clear cells
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={generating || columns.length === 0 || documents.length === 0}
            size="sm"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Generate
          </Button>
        </div>
      </div>

      {progress && progress.total > 0 && (
        <div className="text-xs text-muted-foreground">
          {progress.done} / {progress.total} cells
        </div>
      )}

      <Card className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600 border-b sticky left-0 bg-gray-50 z-10">
                Document
              </th>
              {columns.map((col) => (
                <th
                  key={col.index}
                  className="text-left px-3 py-2 font-medium text-gray-600 border-b min-w-[220px] max-w-[320px]"
                  title={col.description ?? ''}
                >
                  {col.name}
                  {col.format && col.format !== 'text' && (
                    <span className="ml-1 text-[10px] text-gray-400 font-normal">
                      ({col.format})
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id} className="border-b last:border-0">
                <td
                  className="px-3 py-2 align-top sticky left-0 bg-white z-10 max-w-[240px] truncate"
                  title={doc.name}
                >
                  {doc.name}
                </td>
                {columns.map((col) => {
                  const cell = cellMap.get(cellKey(doc.id, col.index));
                  return (
                    <td key={col.index} className="px-3 py-2 align-top">
                      <CellView cell={cell} onRegen={() => handleRegen(doc.id, col.index)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </PageContainer>
  );
}

function CellView({ cell, onRegen }: { cell: TabularCell | undefined; onRegen: () => void }) {
  if (!cell || cell.status === 'pending') {
    return (
      <button
        onClick={onRegen}
        className="text-xs text-muted-foreground italic hover:text-foreground"
      >
        (pending — click to run)
      </button>
    );
  }
  if (cell.status === 'generating') {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Generating…
      </div>
    );
  }
  if (cell.status === 'error') {
    return (
      <div className="text-xs text-red-600">
        Error: {cell.error_message ?? 'unknown'}
        <Button variant="ghost" size="icon" onClick={onRegen} className="ml-1 h-5 w-5">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
    );
  }
  const content = cell.content;
  if (!content) return <span className="text-xs text-muted-foreground">—</span>;
  const flagClass = content.flag ? FLAG_BG[content.flag] : '';
  return (
    <div className="group relative">
      <div className="text-xs whitespace-pre-wrap leading-relaxed pr-3">
        {renderCellText(content.summary)}
      </div>
      {flagClass && (
        <span
          className={`absolute right-0 top-1 h-1.5 w-1.5 rounded-full ${flagClass}`}
          title={content.reasoning ?? content.flag}
        />
      )}
      {content.reasoning && (
        <details className="mt-1 text-[11px] text-muted-foreground">
          <summary className="cursor-pointer">reasoning</summary>
          <div className="whitespace-pre-wrap pt-1">{renderCellText(content.reasoning)}</div>
        </details>
      )}
      <button
        onClick={onRegen}
        className="absolute right-3 top-1 opacity-0 group-hover:opacity-100 text-[10px] text-blue-600 hover:underline"
      >
        regen
      </button>
    </div>
  );
}
