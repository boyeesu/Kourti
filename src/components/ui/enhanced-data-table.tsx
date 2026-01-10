import { useState, ReactNode, useMemo, useEffect } from "react";
import { DataTable, ColumnDef } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Download, Columns } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";

interface EnhancedDataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  getRowKey: (row: T) => string | number;
  exportable?: boolean;
  onExport?: (data: T[]) => void;
  mobileView?: (row: T) => ReactNode;
  title?: string;
  description?: string;
}

export function EnhancedDataTable<T>({
  columns,
  data,
  emptyMessage,
  onRowClick,
  rowClassName,
  getRowKey,
  exportable = false,
  onExport,
  mobileView,
  title,
  description,
}: EnhancedDataTableProps<T>) {
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(columns.map((col) => col.id))
  );
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const filteredColumns = useMemo(
    () => columns.filter((col) => visibleColumns.has(col.id)),
    [columns, visibleColumns]
  );

  const handleExport = () => {
    if (onExport) {
      onExport(data);
    } else {
      // Default CSV export
      const headers = filteredColumns.map((col) => col.header).join(",");
      const rows = data.map((row) =>
        filteredColumns
          .map((col) => {
            let value: unknown;
            if (col.accessorFn) {
              value = col.accessorFn(row);
            } else if (col.accessorKey) {
              value = row[col.accessorKey];
            }
            return `"${String(value ?? "").replace(/"/g, '""')}"`;
          })
          .join(",")
      );
      const csv = [headers, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "export"}-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Mobile card view
  if (isMobile && mobileView) {
    return (
      <div className="space-y-4">
        {title && (
          <div className="flex items-center justify-between">
            <div>
              {title && <h3 className="text-lg font-semibold">{title}</h3>}
              {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
              )}
            </div>
            {exportable && (
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
        <div className="space-y-3">
          {data.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {emptyMessage || "No data available"}
              </CardContent>
            </Card>
          ) : (
            data.map((row) => (
              <Card key={String(getRowKey(row))} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onRowClick?.(row)}>
                <CardContent className="p-4">
                  {mobileView(row)}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(title || exportable || columns.length > 5) && (
        <div className="flex items-center justify-between gap-4">
          {title && (
            <div>
              <h3 className="text-lg font-semibold">{title}</h3>
              {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            {columns.length > 5 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Columns className="h-4 w-4 mr-2" />
                    Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {columns.map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={visibleColumns.has(column.id)}
                      onCheckedChange={(checked) => {
                        const newVisible = new Set(visibleColumns);
                        if (checked) {
                          newVisible.add(column.id);
                        } else {
                          newVisible.delete(column.id);
                        }
                        setVisibleColumns(newVisible);
                      }}
                    >
                      {column.header}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {exportable && (
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            )}
          </div>
        </div>
      )}
      <DataTable
        columns={filteredColumns}
        data={data}
        emptyMessage={emptyMessage}
        onRowClick={onRowClick}
        rowClassName={rowClassName}
        getRowKey={getRowKey}
      />
    </div>
  );
}

