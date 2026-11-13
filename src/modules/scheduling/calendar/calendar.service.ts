import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CreateMeetingParams {
  summary: string;
  description?: string;
  startTime: Date;
  durationMinutes: number;
  mentorEmail: string;
  menteeEmail: string;
  mentorName?: string;
  menteeName?: string;
}

export interface MeetingResult {
  meetingLink: string;
  calendarEventId?: string;
  htmlLink?: string;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly refreshToken: string;

  private cachedAccessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly configService: ConfigService) {
    this.clientId =
      this.configService.get<string>('GOOGLE_MEET_OAUTH_CLIENT_ID') || '';
    this.clientSecret =
      this.configService.get<string>('GOOGLE_MEET_OAUTH_CLIENT_SECRET') || '';
    this.refreshToken =
      this.configService.get<string>('GOOGLE_MEET_REFRESH_TOKEN') || '';
  }

  /**
   * Retrieves a valid Google OAuth2 access token using the stored refresh token.
   */
  private async getAccessToken(): Promise<string> {
    if (this.cachedAccessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.cachedAccessToken;
    }

    this.logger.debug('Refreshing Google OAuth2 access token...');
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `Failed to refresh Google access token: ${response.status} ${errorText}`,
      );
      throw new Error(`Google OAuth token refresh failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data.access_token) {
      throw new Error('No access_token returned by Google OAuth');
    }

    this.cachedAccessToken = String(data.access_token);
    this.tokenExpiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    return this.cachedAccessToken;
  }

  /**
   * Creates a Google Calendar event with a Google Meet conference link,
   * adding mentor and mentee as attendees, with public visibility.
   */
  async createMeeting(params: CreateMeetingParams): Promise<MeetingResult> {
    try {
      const accessToken = await this.getAccessToken();

      const startTime = new Date(params.startTime);
      const endTime = new Date(
        startTime.getTime() + params.durationMinutes * 60 * 1000,
      );

      const attendees: { email: string; displayName?: string }[] = [];
      if (params.mentorEmail && params.mentorEmail.includes('@')) {
        attendees.push({
          email: params.mentorEmail.trim().toLowerCase(),
          displayName: params.mentorName || 'Mentor',
        });
      }
      if (params.menteeEmail && params.menteeEmail.includes('@')) {
        attendees.push({
          email: params.menteeEmail.trim().toLowerCase(),
          displayName: params.menteeName || 'Mentee',
        });
      }

      const requestBody = {
        summary: params.summary,
        description:
          params.description ||
          `1-on-1 Mentorship session via MentorAura.\nMentor: ${params.mentorName || ''} (${params.mentorEmail})\nMentee: ${params.menteeName || ''} (${params.menteeEmail})`,
        start: {
          dateTime: startTime.toISOString(),
        },
        end: {
          dateTime: endTime.toISOString(),
        },
        attendees,
        conferenceData: {
          createRequest: {
            requestId: `mentoraura-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            conferenceSolutionKey: {
              type: 'hangoutsMeet',
            },
          },
        },
        visibility: 'public',
        guestsCanInviteOthers: true,
        guestsCanSeeOtherGuests: true,
      };

      const eventRes = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!eventRes.ok) {
        const errText = await eventRes.text();
        this.logger.error(
          `Google Calendar create event failed: ${eventRes.status} ${errText}`,
        );
        throw new Error(
          `Google Calendar API returned status ${eventRes.status}`,
        );
      }

      const eventData = await eventRes.json();

      // Retrieve the generated Google Meet link
      const meetLink =
        eventData.hangoutLink ||
        eventData.conferenceData?.entryPoints?.find(
          (p: { entryPointType?: string; uri?: string }) =>
            p.entryPointType === 'video',
        )?.uri;

      if (meetLink) {
        this.logger.log(
          `Created Google Meet event ${eventData.id} with link: ${meetLink}`,
        );
        return {
          meetingLink: meetLink,
          calendarEventId: eventData.id,
          htmlLink: eventData.htmlLink,
        };
      }

      this.logger.warn(
        'Google Calendar event created, but no hangoutLink returned; using fallback.',
      );
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(
        `Error generating Google Meet link: ${error.message}`,
        error.stack,
      );
    }

    // Safe fallback if Google Meet link could not be obtained
    const fallbackMeetingLink = `https://meet.jit.si/mentoraura-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    return {
      meetingLink: fallbackMeetingLink,
    };
  }
}
