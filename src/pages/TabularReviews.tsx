import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Table2, Trash2 } from 'lucide-react';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { listTabularReviews, deleteTabularReview, type TabularReview } from '@/lib/featuresApi';
import { toast } from 'sonner';

export default function TabularReviews() {
  const [reviews, setReviews] = useState<TabularReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listTabularReviews()
      .then((rows) => {
        if (!cancelled) setReviews(rows);
      })
      .catch((err) => {
        toast.error('Failed to load tabular reviews', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this tabular review? This cannot be undone.')) return;
    try {
      await deleteTabularReview(id);
      setReviews((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      toast.error('Delete failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tabular Reviews</h1>
          <p className="text-sm text-muted-foreground">
            Build a spreadsheet of LLM extractions across multiple documents.
          </p>
        </div>
        <Button asChild>
          <Link to="/tabular-reviews/new">
            <Plus className="h-4 w-4 mr-2" /> New review
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : reviews.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Table2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              No tabular reviews yet. Create one to extract structured answers from multiple
              documents at once.
            </p>
            <Button asChild>
              <Link to="/tabular-reviews/new">
                <Plus className="h-4 w-4 mr-2" /> Create your first review
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reviews.map((review) => (
            <Card key={review.id} className="hover:shadow-md transition">
              <CardHeader>
                <CardTitle className="text-base">
                  <Link to={`/tabular-reviews/${review.id}`} className="hover:underline">
                    {review.title}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <div>{review.document_ids?.length ?? 0} documents</div>
                <div>{(review.columns_config ?? []).length} columns</div>
                {review.practice && <div>Practice: {review.practice}</div>}
                <div className="flex justify-end pt-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(review.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
