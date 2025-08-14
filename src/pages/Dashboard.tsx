import { useState, useMemo } from "react";
import { Calendar } from "@/components/calendar/Calendar";
import { EventCreateDialog } from "@/components/calendar/EventCreateDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useCases } from "@/hooks/useCases";
import type { Case } from '@/types';

const DEFAULT_WINDOW_DAYS = 7;

export default function Dashboard() {
  const [windowDays, setWindowDays] = useState(DEFAULT_WINDOW_DAYS);
  const { data: casesData = { cases: [], count: 0 } } = useCases();

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + windowDays);

  const upcomingCases = useMemo(
    () =>
      casesData.cases
        .filter((c: Case) => c.next_hearing_date)
        .map((c: Case) => ({ ...c, next_hearing_date: c.next_hearing_date! }))
        .filter((c: Case & { next_hearing_date: string }) => {
          const d = new Date(c.next_hearing_date);
          return d >= now && d <= cutoff;
        }),
    [casesData.cases, windowDays]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <EventCreateDialog />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Cases</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{casesData.count}</div>
            <p className="text-sm text-muted-foreground">Total Cases</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">0</div>
            <p className="text-sm text-muted-foreground">Total Clients</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contracts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">0</div>
            <p className="text-sm text-muted-foreground">Total Contracts</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Hearings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingCases.length > 0 ? (
                  upcomingCases.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.title}</TableCell>
                      <TableCell>{new Date(c.next_hearing_date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Link to={`/cases/${c.id}`}>
                          <Button size="sm">View</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center">
                      No upcoming hearings
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
