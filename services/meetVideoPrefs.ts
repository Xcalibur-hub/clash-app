import type { MeetHoodId, MeetMatchMode } from '../utils/meetModes';

export interface MeetVideoPrefs {
  mode: MeetMatchMode;
  countryCode: string | null;
  hood: MeetHoodId | null;
  interests: string[];
}

let pending: MeetVideoPrefs | null = null;

export function setMeetVideoPrefs(prefs: MeetVideoPrefs): void {
  pending = prefs;
}

export function peekMeetVideoPrefs(): MeetVideoPrefs {
  return (
    pending ?? {
      mode: 'ANYWHERE',
      countryCode: null,
      hood: null,
      interests: [],
    }
  );
}
