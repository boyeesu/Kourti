
import { Button } from "@/components/ui/button";

export type BulkAction =
  | { type: "delete" }
  | { type: "setStatus"; status: string };

export default function BulkToolbar({
  count,
  onAction,
}: {
  count: number;
  onAction: (a: BulkAction) => void;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 bg-card p-2 border-b">
      <span className="text-sm">{count} selected</span>
      <Button size="sm" variant="destructive" onClick={() => onAction({ type: "delete" })}>
        Delete
      </Button>
      <Button size="sm" onClick={() => onAction({ type: "setStatus", status: "active" })}>
        Mark Active
      </Button>
      <Button size="sm" onClick={() => onAction({ type: "setStatus", status: "inactive" })}>
        Mark Inactive
      </Button>
    </div>
  );
}
