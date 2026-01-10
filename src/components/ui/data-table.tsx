import { useState, ReactNode } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export type SortDirection = "asc" | "desc" | null;

export interface ColumnDef<T> {
    id: string;
    header: string;
    accessorKey?: keyof T;
    accessorFn?: (row: T) => unknown;
    cell?: (row: T) => ReactNode;
    sortable?: boolean;
    minWidth?: string;
    className?: string;
}

interface DataTableProps<T> {
    columns: ColumnDef<T>[];
    data: T[];
    emptyMessage?: string;
    onRowClick?: (row: T) => void;
    rowClassName?: (row: T) => string;
    getRowKey: (row: T) => string | number;
}

export function DataTable<T>({
    columns,
    data,
    emptyMessage = "No data available",
    onRowClick,
    rowClassName,
    getRowKey,
}: DataTableProps<T>) {
    const [sortColumn, setSortColumn] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(null);

    const handleSort = (columnId: string) => {
        if (sortColumn === columnId) {
            // Cycle through: asc -> desc -> null
            if (sortDirection === "asc") {
                setSortDirection("desc");
            } else if (sortDirection === "desc") {
                setSortDirection(null);
                setSortColumn(null);
            } else {
                setSortDirection("asc");
            }
        } else {
            setSortColumn(columnId);
            setSortDirection("asc");
        }
    };

    const getSortedData = () => {
        if (!sortColumn || !sortDirection) {
            return data;
        }

        const column = columns.find((col) => col.id === sortColumn);
        if (!column) return data;

        return [...data].sort((a, b) => {
            let aValue: unknown;
            let bValue: unknown;

            if (column.accessorFn) {
                aValue = column.accessorFn(a);
                bValue = column.accessorFn(b);
            } else if (column.accessorKey) {
                aValue = a[column.accessorKey];
                bValue = b[column.accessorKey];
            } else {
                return 0;
            }

            // Handle null/undefined values
            if (aValue == null && bValue == null) return 0;
            if (aValue == null) return sortDirection === "asc" ? 1 : -1;
            if (bValue == null) return sortDirection === "asc" ? -1 : 1;

            // Convert to strings for comparison if needed
            const aStr = String(aValue).toLowerCase();
            const bStr = String(bValue).toLowerCase();

            if (aStr < bStr) return sortDirection === "asc" ? -1 : 1;
            if (aStr > bStr) return sortDirection === "asc" ? 1 : -1;
            return 0;
        });
    };

    const sortedData = getSortedData();

    const getSortIcon = (columnId: string) => {
        if (sortColumn !== columnId) {
            return <ArrowUpDown className="ml-2 h-4 w-4" />;
        }
        if (sortDirection === "asc") {
            return <ArrowUp className="ml-2 h-4 w-4" />;
        }
        if (sortDirection === "desc") {
            return <ArrowDown className="ml-2 h-4 w-4" />;
        }
        return <ArrowUpDown className="ml-2 h-4 w-4" />;
    };

    return (
        <div className="rounded-md border overflow-x-auto bg-[hsl(var(--surface))]">
            <Table>
                <TableHeader>
                    <TableRow>
                        {columns.map((column) => (
                            <TableHead
                                key={column.id}
                                className={column.minWidth ? `min-w-[${column.minWidth}]` : ""}
                                style={column.minWidth ? { minWidth: column.minWidth } : undefined}
                            >
                                {column.sortable !== false ? (
                                    <Button
                                        variant="ghost"
                                        onClick={() => handleSort(column.id)}
                                        className="-ml-3 h-7 px-2 text-[11px] uppercase tracking-[0.08em] data-[state=open]:bg-accent hover:bg-accent/50"
                                    >
                                        {column.header}
                                        {getSortIcon(column.id)}
                                    </Button>
                                ) : (
                                    column.header
                                )}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedData.length > 0 ? (
                        sortedData.map((row) => (
                            <TableRow
                                key={getRowKey(row)}
                                className={`hover:bg-muted/50 ${onRowClick ? "cursor-pointer" : ""
                                    } ${rowClassName ? rowClassName(row) : ""}`}
                                onClick={() => onRowClick?.(row)}
                            >
                                {columns.map((column) => {
                                    let cellContent: ReactNode;

                                    if (column.cell) {
                                        cellContent = column.cell(row);
                                    } else if (column.accessorFn) {
                                        cellContent = column.accessorFn(row);
                                    } else if (column.accessorKey) {
                                        cellContent = String(row[column.accessorKey] ?? "");
                                    } else {
                                        cellContent = "";
                                    }

                                    return (
                                        <TableCell key={column.id} className={column.className}>
                                            {cellContent}
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell
                                colSpan={columns.length}
                                className="h-24 text-center text-muted-foreground"
                            >
                                {emptyMessage}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
