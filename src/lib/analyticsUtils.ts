/**
 * Analytics utility functions for calculating real metrics from data
 */

export interface MonthlyData {
    month: string;
    [key: string]: number | string;
}

export interface StatusData {
    name: string;
    value: number;
    color: string;
}

/**
 * Get status color based on status name
 */
export function getStatusColor(status: string): string {
    const normalizedStatus = status.toLowerCase();

    switch (normalizedStatus) {
        case 'open':
        case 'active':
            return '#3b82f6'; // blue
        case 'in_progress':
        case 'pending':
            return '#f59e0b'; // amber
        case 'closed':
        case 'completed':
            return '#10b981'; // green
        case 'expired':
        case 'overdue':
            return '#ef4444'; // red
        case 'draft':
            return '#6b7280'; // gray
        default:
            return '#8b5cf6'; // purple
    }
}

/**
 * Calculate case status distribution from real case data
 */
export function calculateCaseStatusData(cases: any[]): StatusData[] {
    if (!cases || cases.length === 0) {
        return [];
    }

    const statusMap: Record<string, number> = {};

    cases.forEach((c) => {
        const status = c.status || 'unknown';
        statusMap[status] = (statusMap[status] || 0) + 1;
    });

    return Object.entries(statusMap).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1).replace('_', ' '),
        value,
        color: getStatusColor(name),
    }));
}

/**
 * Calculate monthly trends from timestamped data
 */
export function calculateMonthlyTrends(
    data: any[],
    dateField: string = 'created_at',
    months: number = 6
): MonthlyData[] {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const result: MonthlyData[] = [];

    // Generate last N months
    for (let i = months - 1; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthName = monthNames[date.getMonth()];
        const year = date.getFullYear();

        // Count items in this month
        const count = data.filter((item) => {
            if (!item[dateField]) return false;
            const itemDate = new Date(item[dateField]);
            return itemDate.getMonth() === date.getMonth() &&
                itemDate.getFullYear() === year;
        }).length;

        result.push({
            month: monthName,
            count,
            year,
        });
    }

    return result;
}

/**
 * Calculate monthly client activity (new vs active)
 */
export function calculateClientActivity(
    clients: any[],
    months: number = 6
): MonthlyData[] {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const result: MonthlyData[] = [];

    for (let i = months - 1; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthName = monthNames[date.getMonth()];
        const year = date.getFullYear();

        // Count new clients in this month
        const newClients = clients.filter((client) => {
            if (!client.created_at) return false;
            const clientDate = new Date(client.created_at);
            return clientDate.getMonth() === date.getMonth() &&
                clientDate.getFullYear() === year;
        }).length;

        // Count active clients (created on or before this month and status is active)
        const activeClients = clients.filter((client) => {
            if (!client.created_at) return false;
            const clientDate = new Date(client.created_at);
            const isCreatedBefore = clientDate <= new Date(year, date.getMonth() + 1, 0);
            const isActive = client.status === 'active';
            return isCreatedBefore && isActive;
        }).length;

        result.push({
            month: monthName,
            new: newClients,
            active: activeClients,
        });
    }

    return result;
}

/**
 * Calculate monthly revenue from invoices
 */
export function calculateMonthlyRevenue(
    invoices: any[],
    contracts: any[],
    months: number = 6
): MonthlyData[] {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const result: MonthlyData[] = [];

    for (let i = months - 1; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthName = monthNames[date.getMonth()];
        const year = date.getFullYear();

        // Sum revenue from paid invoices in this month
        const revenue = invoices
            .filter((invoice) => {
                if (!invoice.created_at || invoice.status !== 'paid') return false;
                const invoiceDate = new Date(invoice.created_at);
                return invoiceDate.getMonth() === date.getMonth() &&
                    invoiceDate.getFullYear() === year;
            })
            .reduce((sum, invoice) => sum + (invoice.total_amount || 0), 0);

        // Sum contract values created in this month
        const contractValue = contracts
            .filter((contract) => {
                if (!contract.created_at) return false;
                const contractDate = new Date(contract.created_at);
                return contractDate.getMonth() === date.getMonth() &&
                    contractDate.getFullYear() === year;
            })
            .reduce((sum, contract) => sum + (contract.value || 0), 0);

        result.push({
            month: monthName,
            revenue,
            contracts: contractValue,
        });
    }

    return result;
}

/**
 * Calculate percentage change between two values
 */
export function calculatePercentageChange(current: number, previous: number): {
    percentage: number;
    direction: 'up' | 'down' | 'neutral';
    formatted: string;
} {
    if (previous === 0) {
        return {
            percentage: current > 0 ? 100 : 0,
            direction: current > 0 ? 'up' : 'neutral',
            formatted: current > 0 ? '↑ 100%' : '—',
        };
    }

    const change = ((current - previous) / previous) * 100;
    const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral';
    const formatted = change > 0
        ? `↑ ${Math.abs(change).toFixed(0)}%`
        : change < 0
            ? `↓ ${Math.abs(change).toFixed(0)}%`
            : '—';

    return {
        percentage: change,
        direction,
        formatted,
    };
}

/**
 * Calculate month-over-month metrics
 */
export function calculateMonthOverMonthMetrics(data: any[], dateField: string = 'created_at') {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const currentMonthCount = data.filter((item) => {
        if (!item[dateField]) return false;
        const date = new Date(item[dateField]);
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    }).length;

    const lastMonthCount = data.filter((item) => {
        if (!item[dateField]) return false;
        const date = new Date(item[dateField]);
        return date.getMonth() === lastMonth && date.getFullYear() === lastMonthYear;
    }).length;

    return calculatePercentageChange(currentMonthCount, lastMonthCount);
}
