/**
 * Analytics utility functions for calculating metrics from real database data
 */

interface HasStatus {
  status?: string | null;
}

interface HasCreatedAt {
  created_at?: string | null;
}

interface HasValue {
  value?: number | null;
}

interface Invoice extends HasCreatedAt {
  total_amount?: number | null;
  status?: string | null;
}

interface Contract extends HasCreatedAt, HasValue {
  status?: string | null;
}

// Status colors for charts
const STATUS_COLORS: Record<string, string> = {
  open: "#3b82f6", // blue
  active: "#10b981", // green
  in_progress: "#f59e0b", // amber
  pending: "#8b5cf6", // purple
  closed: "#6b7280", // gray
  review: "#ec4899", // pink
  draft: "#94a3b8", // slate
  expired: "#ef4444", // red
  terminated: "#dc2626", // red darker
};

/**
 * Calculate case status distribution for pie chart
 */
export function calculateCaseStatusData(cases: HasStatus[]): Array<{
  name: string;
  value: number;
  color: string;
}> {
  if (!cases || cases.length === 0) {
    return [];
  }

  const statusCounts: Record<string, number> = {};

  cases.forEach((caseItem) => {
    const status = (caseItem.status || "unknown").toLowerCase();
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  return Object.entries(statusCounts)
    .map(([status, count]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1).replace("_", " "),
      value: count,
      color: STATUS_COLORS[status] || "#6b7280",
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Calculate client activity trends over the past N months
 */
export function calculateClientActivity(
  clients: HasCreatedAt[],
  monthsBack: number = 6
): Array<{ month: string; active: number; new: number }> {
  const now = new Date();
  const months: string[] = [];
  const monthData: Record<string, { active: number; new: number }> = {};

  // Generate month labels
  for (let i = monthsBack - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthLabel = date.toLocaleString("default", { month: "short" });
    months.push(monthLabel);
    monthData[monthLabel] = { active: 0, new: 0 };
  }

  // Count clients by month
  clients.forEach((client) => {
    if (!client.created_at) return;

    const createdDate = new Date(client.created_at);
    const monthsSinceCreation = Math.floor(
      (now.getTime() - createdDate.getTime()) / (30 * 24 * 60 * 60 * 1000)
    );

    if (monthsSinceCreation < monthsBack) {
      const monthLabel = createdDate.toLocaleString("default", { month: "short" });
      if (monthData[monthLabel]) {
        monthData[monthLabel].new++;
      }
    }
  });

  // Calculate running total for "active" (cumulative)
  let runningTotal = 0;
  return months.map((month) => {
    runningTotal += monthData[month].new;
    return {
      month,
      active: runningTotal,
      new: monthData[month].new,
    };
  });
}

/**
 * Calculate monthly revenue from invoices and contracts
 * NOTE: Revenue functionality is hidden but kept for future use
 */
export function calculateMonthlyRevenue(
  invoices: Invoice[],
  contracts: Contract[],
  monthsBack: number = 6
): Array<{ month: string; revenue: number; contracts: number }> {
  const now = new Date();
  const months: string[] = [];
  const monthData: Record<string, { revenue: number; contracts: number }> = {};

  // Generate month labels
  for (let i = monthsBack - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthLabel = date.toLocaleString("default", { month: "short" });
    months.push(monthLabel);
    monthData[monthLabel] = { revenue: 0, contracts: 0 };
  }

  // Sum paid invoice amounts by month
  invoices.forEach((invoice) => {
    if (!invoice.created_at || invoice.status !== "paid") return;

    const createdDate = new Date(invoice.created_at);
    const monthLabel = createdDate.toLocaleString("default", { month: "short" });

    if (monthData[monthLabel]) {
      monthData[monthLabel].revenue += invoice.total_amount || 0;
    }
  });

  // Sum contract values by month
  contracts.forEach((contract) => {
    if (!contract.created_at) return;

    const createdDate = new Date(contract.created_at);
    const monthLabel = createdDate.toLocaleString("default", { month: "short" });

    if (monthData[monthLabel]) {
      monthData[monthLabel].contracts += contract.value || 0;
    }
  });

  return months.map((month) => ({
    month,
    revenue: monthData[month].revenue,
    contracts: monthData[month].contracts,
  }));
}

/**
 * Calculate month-over-month change metrics
 */
export function calculateMonthOverMonthMetrics(
  items: HasCreatedAt[]
): { current: number; previous: number; change: number; direction: "up" | "down" | "flat"; formatted: string } {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  let currentCount = 0;
  let previousCount = 0;

  items.forEach((item) => {
    if (!item.created_at) return;

    const createdDate = new Date(item.created_at);

    if (createdDate >= currentMonthStart) {
      currentCount++;
    } else if (createdDate >= previousMonthStart && createdDate < currentMonthStart) {
      previousCount++;
    }
  });

  const change = previousCount === 0 
    ? (currentCount > 0 ? 100 : 0)
    : Math.round(((currentCount - previousCount) / previousCount) * 100);

  const direction: "up" | "down" | "flat" = 
    change > 0 ? "up" : change < 0 ? "down" : "flat";

  const formatted = change === 0 
    ? "No change" 
    : `${change > 0 ? "+" : ""}${change}%`;

  return { current: currentCount, previous: previousCount, change, direction, formatted };
}

/**
 * Calculate contract status distribution
 */
export function calculateContractStatusData(contracts: HasStatus[]): Array<{
  name: string;
  value: number;
  color: string;
}> {
  if (!contracts || contracts.length === 0) {
    return [];
  }

  const statusCounts: Record<string, number> = {};

  contracts.forEach((contract) => {
    const status = (contract.status || "unknown").toLowerCase();
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  return Object.entries(statusCounts)
    .map(([status, count]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value: count,
      color: STATUS_COLORS[status] || "#6b7280",
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Calculate priority distribution for cases
 */
export function calculatePriorityDistribution(
  cases: Array<{ priority?: string | null }>
): Array<{ name: string; value: number; color: string }> {
  const priorityColors: Record<string, string> = {
    high: "#ef4444",
    medium: "#f59e0b",
    low: "#10b981",
  };

  const priorityCounts: Record<string, number> = {};

  cases.forEach((caseItem) => {
    const priority = (caseItem.priority || "unset").toLowerCase();
    priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
  });

  return Object.entries(priorityCounts)
    .map(([priority, count]) => ({
      name: priority.charAt(0).toUpperCase() + priority.slice(1),
      value: count,
      color: priorityColors[priority] || "#6b7280",
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Calculate activity trends from case activities
 */
export function calculateActivityTrends(
  activities: Array<{ created_at?: string | null; activity_type?: string | null }>,
  monthsBack: number = 6
): Array<Record<string, string | number>> {
  const now = new Date();
  const months: string[] = [];
  const monthData: Record<string, Record<string, number>> = {};
  const allTypes = new Set<string>();

  // Generate month labels
  for (let i = monthsBack - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthLabel = date.toLocaleString("default", { month: "short" });
    months.push(monthLabel);
    monthData[monthLabel] = {};
  }

  // Count activities by month and type
  activities.forEach((activity) => {
    if (!activity.created_at) return;

    const createdDate = new Date(activity.created_at);
    const monthLabel = createdDate.toLocaleString("default", { month: "short" });
    const activityType = activity.activity_type || "Other";

    allTypes.add(activityType);

    if (monthData[monthLabel]) {
      monthData[monthLabel][activityType] = (monthData[monthLabel][activityType] || 0) + 1;
    }
  });

  // Get top 3 activity types
  const typeCounts: Record<string, number> = {};
  activities.forEach((activity) => {
    const type = activity.activity_type || "Other";
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });

  const topTypes = Object.entries(typeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([type]) => type);

  // Build result array
  return months.map((month) => {
    const result: Record<string, string | number> = { month };
    topTypes.forEach((type) => {
      result[type] = monthData[month][type] || 0;
    });
    return result;
  });
}

/**
 * Calculate documents uploaded per month
 */
export function calculateDocumentTrends(
  documents: HasCreatedAt[],
  monthsBack: number = 6
): Array<{ month: string; count: number }> {
  const now = new Date();
  const months: string[] = [];
  const monthData: Record<string, number> = {};

  // Generate month labels
  for (let i = monthsBack - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthLabel = date.toLocaleString("default", { month: "short" });
    months.push(monthLabel);
    monthData[monthLabel] = 0;
  }

  // Count documents by month
  documents.forEach((doc) => {
    if (!doc.created_at) return;

    const createdDate = new Date(doc.created_at);
    const monthLabel = createdDate.toLocaleString("default", { month: "short" });

    if (monthData[monthLabel] !== undefined) {
      monthData[monthLabel]++;
    }
  });

  return months.map((month) => ({
    month,
    count: monthData[month],
  }));
}

/**
 * Calculate task completion rate
 */
export function calculateTaskMetrics(
  tasks: Array<{ completed?: boolean | null; priority?: string | null; due_date?: string | null }>
): {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  completionRate: number;
} {
  const now = new Date();
  let total = 0;
  let completed = 0;
  let overdue = 0;

  tasks.forEach((task) => {
    total++;
    if (task.completed) {
      completed++;
    } else if (task.due_date && new Date(task.due_date) < now) {
      overdue++;
    }
  });

  return {
    total,
    completed,
    pending: total - completed,
    overdue,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}
