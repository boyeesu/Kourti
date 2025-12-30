declare const Deno: any;

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  createCorsSecurityHeaders,
  createEmptyResponse,
  createJsonResponse,
} from "../_shared/responseHeaders.ts";

type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  location: string | null;
  attendees: string[] | null;
  event_type: string | null;
  created_at: string;
  updated_at: string;
};

const corsOptions = {
  allowMethods: ["GET", "OPTIONS"],
  exposeHeaders: ["Content-Disposition"],
};

const PROD_ID = "-//Kouti//Calendar//EN";
const CALENDAR_NAME = "Kouti Calendar";

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldLine(line: string): string {
  const limit = 75;
  let remaining = line;
  let output = "";

  while (remaining.length > limit) {
    output += `${remaining.slice(0, limit)}\r\n `;
    remaining = remaining.slice(limit);
  }

  return output + remaining;
}

function formatUtcDateTime(value: string): { formatted: string; isAllDay: boolean } {
  const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (isAllDay) {
    return { formatted: value.replace(/-/g, ""), isAllDay: true };
  }

  const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  const normalized = hasTimezone ? value : `${value}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    const fallback = new Date(value);
    const fallbackIso = fallback.toISOString().replace(/\.\d{3}Z$/, "Z");
    return { formatted: fallbackIso.replace(/[-:]/g, ""), isAllDay: false };
  }

  const iso = parsed.toISOString().replace(/\.\d{3}Z$/, "Z");
  return { formatted: iso.replace(/[-:]/g, ""), isAllDay: false };
}

function buildEventLines(event: CalendarEvent): string[] {
  const updated = event.updated_at || event.created_at || new Date().toISOString();
  const dtstamp = formatUtcDateTime(updated).formatted;
  const lastModified = formatUtcDateTime(updated).formatted;
  const uid = `${event.id}@kouti-calendar`;

  const start = formatUtcDateTime(event.start_date);
  const end = formatUtcDateTime(event.end_date);

  const lines: string[] = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `LAST-MODIFIED:${lastModified}`,
  ];

  if (start.isAllDay) {
    lines.push(`DTSTART;VALUE=DATE:${start.formatted}`);
  } else {
    lines.push(`DTSTART:${start.formatted}`);
  }

  if (end.isAllDay) {
    lines.push(`DTEND;VALUE=DATE:${end.formatted}`);
  } else {
    lines.push(`DTEND:${end.formatted}`);
  }

  lines.push(`SUMMARY:${escapeText(event.title)}`);

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  }

  if (event.location) {
    lines.push(`LOCATION:${escapeText(event.location)}`);
  }

  if (event.event_type) {
    lines.push(`CATEGORIES:${escapeText(event.event_type)}`);
  }

  if (event.attendees?.length) {
    event.attendees.forEach((attendee) => {
      const trimmed = attendee.trim();
      if (trimmed) {
        lines.push(`ATTENDEE:mailto:${escapeText(trimmed)}`);
      }
    });
  }

  lines.push("END:VEVENT");

  return lines;
}

function buildCalendar(events: CalendarEvent[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    `PRODID:${PROD_ID}`,
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${CALENDAR_NAME}`,
    "X-WR-TIMEZONE:UTC",
  ];

  events.forEach((event) => {
    lines.push(...buildEventLines(event));
  });

  lines.push("END:VCALENDAR");

  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

function parseDateParam(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  if (req.method !== "GET") {
    return createJsonResponse({ error: "Method not allowed" }, { status: 405, cors: corsOptions });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return createJsonResponse({ error: "Missing token" }, { status: 400, cors: corsOptions });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, organization_id")
      .eq("calendar_ics_token", token)
      .maybeSingle();

    if (profileError) {
      console.error("calendar-ics profile lookup error:", profileError);
      return createJsonResponse({ error: "Failed to validate token" }, { status: 500, cors: corsOptions });
    }

    if (!profile?.organization_id) {
      return createJsonResponse({ error: "Invalid token" }, { status: 401, cors: corsOptions });
    }

    const startParam = parseDateParam(url.searchParams.get("start"));
    const endParam = parseDateParam(url.searchParams.get("end"));

    if (url.searchParams.get("start") && !startParam) {
      return createJsonResponse({ error: "Invalid start parameter" }, { status: 400, cors: corsOptions });
    }

    if (url.searchParams.get("end") && !endParam) {
      return createJsonResponse({ error: "Invalid end parameter" }, { status: 400, cors: corsOptions });
    }

    let eventsQuery = supabase
      .from("calendar_events")
      .select(
        "id,title,description,start_date,end_date,location,attendees,event_type,created_at,updated_at",
      )
      .eq("organization_id", profile.organization_id)
      .order("start_date", { ascending: true });

    if (startParam) {
      eventsQuery = eventsQuery.gte("end_date", startParam);
    }

    if (endParam) {
      eventsQuery = eventsQuery.lte("start_date", endParam);
    }

    const { data: events, error: eventsError } = await eventsQuery;

    if (eventsError) {
      console.error("calendar-ics events query error:", eventsError);
      return createJsonResponse({ error: "Failed to load events" }, { status: 500, cors: corsOptions });
    }

    const calendarBody = buildCalendar((events ?? []) as CalendarEvent[]);
    const corsHeaders = createCorsSecurityHeaders(corsOptions);

    return new Response(calendarBody, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="kouti-calendar.ics"',
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Error in calendar-ics:", error);
    return createJsonResponse({ error: String(error) }, { status: 500, cors: corsOptions });
  }
});
