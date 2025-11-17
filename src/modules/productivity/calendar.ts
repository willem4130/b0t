import { google } from 'googleapis';
import ICAL from 'ical.js';
import Bottleneck from 'bottleneck';
import CircuitBreaker from 'opossum';
import { logger } from '@/lib/logger';

/**
 * Calendar Module
 *
 * Manage calendar events and scheduling
 * - Google Calendar integration
 * - Create, update, delete events
 * - List and search events
 * - iCal format support
 * - Recurring events
 * - Time zone handling
 *
 * Perfect for:
 * - Meeting automation
 * - Reminder workflows
 * - Scheduling automation
 * - Event synchronization
 */

const limiter = new Bottleneck({
  minTime: 100, // Max 10 requests per second
  maxConcurrent: 5,
});

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  }>;
  recurrence?: string[];
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
  visibility?: 'default' | 'public' | 'private' | 'confidential';
  status?: 'confirmed' | 'tentative' | 'cancelled';
}

export interface CalendarListOptions {
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  orderBy?: 'startTime' | 'updated';
  query?: string;
  showDeleted?: boolean;
  singleEvents?: boolean;
}

/**
 * Initialize Google Calendar client
 */
function getCalendarClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Create calendar event
 */
async function createEventInternal(
  accessToken: string,
  calendarId: string,
  event: CalendarEvent
): Promise<CalendarEvent> {
  logger.info({ calendarId, summary: event.summary }, 'Creating calendar event');

  try {
    const calendar = getCalendarClient(accessToken);

    const response = await calendar.events.insert({
      calendarId,
      requestBody: event as never,
    });

    logger.info(
      {
        calendarId,
        eventId: response.data.id,
        summary: event.summary,
      },
      'Calendar event created'
    );

    return response.data as unknown as CalendarEvent;
  } catch (error) {
    logger.error({ error, calendarId, summary: event.summary }, 'Failed to create calendar event');
    throw new Error(
      `Failed to create calendar event: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

const createEventBreaker = new CircuitBreaker(createEventInternal, {
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

const createEventRateLimited = limiter.wrap(
  async (accessToken: string, calendarId: string, event: CalendarEvent) =>
    createEventBreaker.fire(accessToken, calendarId, event)
);

export async function createEvent(
  accessToken: string,
  calendarId: string = 'primary',
  event: CalendarEvent
): Promise<CalendarEvent> {
  return (await createEventRateLimited(accessToken, calendarId, event)) as unknown as CalendarEvent;
}

/**
 * Update calendar event
 */
async function updateEventInternal(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: CalendarEvent
): Promise<CalendarEvent> {
  logger.info({ calendarId, eventId }, 'Updating calendar event');

  try {
    const calendar = getCalendarClient(accessToken);

    const response = await calendar.events.update({
      calendarId,
      eventId,
      requestBody: event as never,
    });

    logger.info({ calendarId, eventId }, 'Calendar event updated');

    return response.data as unknown as CalendarEvent;
  } catch (error) {
    logger.error({ error, calendarId, eventId }, 'Failed to update calendar event');
    throw new Error(
      `Failed to update calendar event: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

const updateEventBreaker = new CircuitBreaker(updateEventInternal, {
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

const updateEventRateLimited = limiter.wrap(
  async (accessToken: string, calendarId: string, eventId: string, event: CalendarEvent) =>
    updateEventBreaker.fire(accessToken, calendarId, eventId, event)
);

export async function updateEvent(
  accessToken: string,
  calendarId: string = 'primary',
  eventId: string,
  event: CalendarEvent
): Promise<CalendarEvent> {
  return (await updateEventRateLimited(
    accessToken,
    calendarId,
    eventId,
    event
  )) as unknown as CalendarEvent;
}

/**
 * Delete calendar event
 */
async function deleteEventInternal(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  logger.info({ calendarId, eventId }, 'Deleting calendar event');

  try {
    const calendar = getCalendarClient(accessToken);

    await calendar.events.delete({
      calendarId,
      eventId,
    });

    logger.info({ calendarId, eventId }, 'Calendar event deleted');
  } catch (error) {
    logger.error({ error, calendarId, eventId }, 'Failed to delete calendar event');
    throw new Error(
      `Failed to delete calendar event: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

const deleteEventBreaker = new CircuitBreaker(deleteEventInternal, {
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

const deleteEventRateLimited = limiter.wrap(
  async (accessToken: string, calendarId: string, eventId: string) =>
    deleteEventBreaker.fire(accessToken, calendarId, eventId)
);

export async function deleteEvent(
  accessToken: string,
  calendarId: string = 'primary',
  eventId: string
): Promise<void> {
  await deleteEventRateLimited(accessToken, calendarId, eventId);
}

/**
 * Get calendar event
 */
async function getEventInternal(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<CalendarEvent> {
  logger.info({ calendarId, eventId }, 'Getting calendar event');

  try {
    const calendar = getCalendarClient(accessToken);

    const response = await calendar.events.get({
      calendarId,
      eventId,
    });

    logger.info({ calendarId, eventId }, 'Calendar event retrieved');

    return response.data as unknown as CalendarEvent;
  } catch (error) {
    logger.error({ error, calendarId, eventId }, 'Failed to get calendar event');
    throw new Error(
      `Failed to get calendar event: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

const getEventBreaker = new CircuitBreaker(getEventInternal, {
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

const getEventRateLimited = limiter.wrap(
  async (accessToken: string, calendarId: string, eventId: string) =>
    getEventBreaker.fire(accessToken, calendarId, eventId)
);

export async function getEvent(
  accessToken: string,
  calendarId: string = 'primary',
  eventId: string
): Promise<CalendarEvent> {
  return (await getEventRateLimited(accessToken, calendarId, eventId)) as unknown as CalendarEvent;
}

/**
 * List calendar events
 */
async function listEventsInternal(
  accessToken: string,
  calendarId: string,
  options: CalendarListOptions
): Promise<CalendarEvent[]> {
  logger.info({ calendarId, options }, 'Listing calendar events');

  try {
    const calendar = getCalendarClient(accessToken);

    const response = await calendar.events.list({
      calendarId,
      timeMin: options.timeMin,
      timeMax: options.timeMax,
      maxResults: options.maxResults,
      orderBy: options.orderBy,
      q: options.query,
      showDeleted: options.showDeleted,
      singleEvents: options.singleEvents ?? true,
    });

    const events = (response.data.items || []) as unknown as CalendarEvent[];

    logger.info({ calendarId, eventCount: events.length }, 'Calendar events listed');

    return events;
  } catch (error) {
    logger.error({ error, calendarId }, 'Failed to list calendar events');
    throw new Error(
      `Failed to list calendar events: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

const listEventsBreaker = new CircuitBreaker(listEventsInternal, {
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

const listEventsRateLimited = limiter.wrap(
  async (accessToken: string, calendarId: string, options: CalendarListOptions) =>
    listEventsBreaker.fire(accessToken, calendarId, options)
);

export async function listEvents(
  accessToken: string,
  calendarId: string = 'primary',
  options: CalendarListOptions = {}
): Promise<CalendarEvent[]> {
  return (await listEventsRateLimited(
    accessToken,
    calendarId,
    options
  )) as unknown as CalendarEvent[];
}

/**
 * Get upcoming events
 */
export async function getUpcomingEvents(
  accessToken: string,
  calendarId: string = 'primary',
  maxResults: number = 10
): Promise<CalendarEvent[]> {
  logger.info({ calendarId, maxResults }, 'Getting upcoming events');

  const now = new Date().toISOString();

  return listEvents(accessToken, calendarId, {
    timeMin: now,
    maxResults,
    orderBy: 'startTime',
    singleEvents: true,
  });
}

/**
 * Search events by query
 */
export async function searchEvents(
  accessToken: string,
  query: string,
  calendarId: string = 'primary',
  maxResults: number = 25
): Promise<CalendarEvent[]> {
  logger.info({ calendarId, query, maxResults }, 'Searching calendar events');

  return listEvents(accessToken, calendarId, {
    query,
    maxResults,
    orderBy: 'startTime',
    singleEvents: true,
  });
}

/**
 * Get events in date range
 */
export async function getEventsInRange(
  accessToken: string,
  startDate: Date,
  endDate: Date,
  calendarId: string = 'primary'
): Promise<CalendarEvent[]> {
  logger.info(
    {
      calendarId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    'Getting events in date range'
  );

  return listEvents(accessToken, calendarId, {
    timeMin: startDate.toISOString(),
    timeMax: endDate.toISOString(),
    orderBy: 'startTime',
    singleEvents: true,
  });
}

/**
 * Create quick event (simpler interface)
 */
export async function createQuickEvent(
  accessToken: string,
  summary: string,
  startDate: Date,
  endDate: Date,
  options: {
    calendarId?: string;
    description?: string;
    location?: string;
    timeZone?: string;
  } = {}
): Promise<CalendarEvent> {
  const event: CalendarEvent = {
    summary,
    description: options.description,
    location: options.location,
    start: {
      dateTime: startDate.toISOString(),
      timeZone: options.timeZone || 'UTC',
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: options.timeZone || 'UTC',
    },
  };

  return createEvent(accessToken, options.calendarId || 'primary', event);
}

/**
 * Parse iCal format to CalendarEvent
 */
export function parseICalEvent(icalString: string): CalendarEvent[] {
  logger.info({ icalLength: icalString.length }, 'Parsing iCal');

  try {
    const jcalData = ICAL.parse(icalString);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    const events: CalendarEvent[] = vevents.map((vevent) => {
      const event = new ICAL.Event(vevent);

      return {
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: {
          dateTime: event.startDate.toJSDate().toISOString(),
        },
        end: {
          dateTime: event.endDate.toJSDate().toISOString(),
        },
      };
    });

    logger.info({ eventCount: events.length }, 'iCal parsed successfully');

    return events;
  } catch (error) {
    logger.error({ error }, 'Failed to parse iCal');
    throw new Error(
      `Failed to parse iCal: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Convert CalendarEvent to iCal format
 */
export function convertToICal(event: CalendarEvent): string {
  logger.info({ summary: event.summary }, 'Converting event to iCal');

  try {
    const comp = new ICAL.Component(['vcalendar', [], []]);
    comp.updatePropertyWithValue('version', '2.0');
    comp.updatePropertyWithValue('prodid', '-//b0t//Workflow Automation//EN');

    const vevent = new ICAL.Component('vevent');
    const icalEvent = new ICAL.Event(vevent);

    icalEvent.summary = event.summary;
    if (event.description) icalEvent.description = event.description;
    if (event.location) icalEvent.location = event.location;

    if (event.start.dateTime) {
      icalEvent.startDate = ICAL.Time.fromJSDate(new Date(event.start.dateTime), true);
    }
    if (event.end.dateTime) {
      icalEvent.endDate = ICAL.Time.fromJSDate(new Date(event.end.dateTime), true);
    }

    comp.addSubcomponent(vevent);

    const icalString = comp.toString();

    logger.info({ icalLength: icalString.length }, 'Event converted to iCal');

    return icalString;
  } catch (error) {
    logger.error({ error }, 'Failed to convert to iCal');
    throw new Error(
      `Failed to convert to iCal: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
