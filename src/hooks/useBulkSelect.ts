import { useState } from "react";

export function useBulkSelect<T extends { id: string }>(rows: T[]) {
  const [selected, setSelected] = useState<string[]>([]);
  const allIds = rows.map(r => r.id);
  const toggle = (id: string) =>
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const isSelected = (id: string) => selected.includes(id);
  const toggleAll = () =>
    setSelected(s => (s.length === allIds.length ? [] : allIds));
  const clear = () => setSelected([]);
  return { selected, isSelected, toggle, toggleAll, clear };
}
