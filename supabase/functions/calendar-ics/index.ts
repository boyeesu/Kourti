declare const Deno: any;

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  createCorsSecurityHeaders,
  createEmptyResponse,
  createJsonResponse,
  CorsSecurityHeadersOptions,
} from "../_shared/responseHeaders.ts";
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMIT_PRESETS, createRateLimitHeaders } from "../_shared/rateLimiting.ts";
import { createErrorResponse } from "../_shared/errorHandling.ts";

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

const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
  "https://app.kourti.com",
  "https://kouti-legal-hub-41.lovable.app",
]
  .flatMap((value) => (value ? value.split(",") : []))
  .filter(Boolean)
  .map((origin) => {
    if (origin && !origin.startsWith('http://') && !origin.startsWith('https://')) {
      return `https://${origin}`;
    }
    return origin;
  })
  .filter((origin) => origin && (origin.startsWith('http://') || origin.startsWith('https://')));

function getCorsOptions(requestOrigin: string | null): CorsSecurityHeadersOptions {
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : (ALLOWED_ORIGINS[0] || "https://app.kourti.com");

  return {
    origin,
    requestOrigin,
    allowedOrigins: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : undefined,
    allowCredentials: true,
    allowMethods: ["GET", "OPTIONS"],
    exposeHeaders: ["Content-Disposition"],
  };
}

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
  const requestOrigin = req.headers.get("Origin");
  const corsOptions = getCorsOptions(requestOrigin);

  if (req.method === "OPTIONS") {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  if (req.method !== "GET") {
    return createJsonResponse(
      { 
        success: false,
        error: "Method not allowed",
        errorCode: "METHOD_NOT_ALLOWED"
      },
      { status: 405, cors: corsOptions }
    );
  }

  // Rate limiting - prevent abuse
  const rateLimitId = getRateLimitIdentifier(req);
  const rateLimitResult = checkRateLimit({
    ...RATE_LIMIT_PRESETS.API,
    identifier: rateLimitId,
  });

  if (!rateLimitResult.allowed) {
    const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
    return createJsonResponse(
      {
        success: false,
        error: 'Too many requests. Please try again later.',
        errorCode: 'RATE_LIMIT_EXCEEDED',
      },
      {
        status: 429,
        cors: corsOptions,
        headers: rateLimitHeaders,
      }
    );
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return createJsonResponse(
        {
          success: false,
          error: "Missing token",
          errorCode: "VALIDATION_ERROR"
        },
        { status: 400, cors: corsOptions }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile, error: profileError } = await supabase
      .from("profiles" as any)
      .select("user_id, organization_id")
      .eq("calendar_ics_token", token)
      .maybeSingle() as { data: { user_id: string; organization_id: string } | null; error: any };

    if (profileError) {
      console.error("calendar-ics profile lookup error:", profileError);
      return createJsonResponse(
        {
          success: false,
          error: "Failed to validate token",
          errorCode: "VALIDATION_ERROR"
        },
        { status: 500, cors: corsOptions }
      );
    }

    if (!profile?.organization_id) {
      return createJsonResponse(
        {
          success: false,
          error: "Invalid token",
          errorCode: "UNAUTHORIZED"
        },
        { status: 401, cors: corsOptions }
      );
    }

    const startParam = parseDateParam(url.searchParams.get("start"));
    const endParam = parseDateParam(url.searchParams.get("end"));

    if (url.searchParams.get("start") && !startParam) {
      return createJsonResponse(
        {
          success: false,
          error: "Invalid start parameter",
          errorCode: "VALIDATION_ERROR"
        },
        { status: 400, cors: corsOptions }
      );
    }

    if (url.searchParams.get("end") && !endParam) {
      return createJsonResponse(
        {
          success: false,
          error: "Invalid end parameter",
          errorCode: "VALIDATION_ERROR"
        },
        { status: 400, cors: corsOptions }
      );
    }

    let eventsQuery = supabase
      .from("calendar_events" as any)
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
      return createJsonResponse(
        {
          success: false,
          error: "Failed to load events",
          errorCode: "INTERNAL_ERROR"
        },
        { status: 500, cors: corsOptions }
      );
    }

    const calendarBody = buildCalendar((events ?? []) as CalendarEvent[]);
    const corsHeaders = createCorsSecurityHeaders(corsOptions);
    const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);

    return new Response(calendarBody, {
      status: 200,
      headers: {
        ...corsHeaders,
        ...rateLimitHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="kouti-calendar.ics"',
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: unknown) {
    return createErrorResponse(error, corsOptions, {
      function: 'calendar-ics',
    });
  }
});
