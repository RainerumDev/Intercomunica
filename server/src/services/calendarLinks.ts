import { canAccessApp } from "../auth/session.js";
import { config, usesPersonalCalendar } from "../config.js";
import { prisma } from "../db.js";
import {
  createFeedCredential,
  decryptFeedToken,
} from "./calendarFeedCredential.js";

export interface StoredFeedCredential {
  token: string;
  tokenHash: string;
  issuedAt: Date;
  lastFetchedAt: Date | null;
}

export interface CalendarLinksResponse {
  generalGoogleUrl: string | null;
  personalIcsUrl: string | null;
  personalWebcalUrl: string | null;
  personalFeedEligible: boolean;
  lastFetchedAt: Date | null;
}

type FeedUser = {
  id: string;
  email: string;
  isActive: boolean;
  calendarFeedTokenHash: string | null;
  calendarFeedTokenEnc: string | null;
  calendarFeedTokenIssuedAt: Date | null;
  calendarFeedLastFetchedAt: Date | null;
};

export function generalGoogleCalendarUrl(calendarId: string): string {
  return `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarId)}&ctz=Europe%2FRome`;
}

export function isPersonalFeedEligible(user: Pick<FeedUser, "email" | "isActive">): boolean {
  return canAccessApp(user.email, user.isActive) && usesPersonalCalendar(user.email);
}

async function findFeedUser(userId: string): Promise<FeedUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      isActive: true,
      calendarFeedTokenHash: true,
      calendarFeedTokenEnc: true,
      calendarFeedTokenIssuedAt: true,
      calendarFeedLastFetchedAt: true,
    },
  });
  if (!user) throw new Error("User not found");
  return user;
}

function storedCredential(user: FeedUser): StoredFeedCredential | null {
  if (
    !user.calendarFeedTokenHash ||
    !user.calendarFeedTokenEnc ||
    !user.calendarFeedTokenIssuedAt
  ) {
    return null;
  }
  return {
    token: decryptFeedToken(user.calendarFeedTokenEnc),
    tokenHash: user.calendarFeedTokenHash,
    issuedAt: user.calendarFeedTokenIssuedAt,
    lastFetchedAt: user.calendarFeedLastFetchedAt,
  };
}

export async function ensureUserFeedCredential(userId: string): Promise<StoredFeedCredential> {
  const user = await findFeedUser(userId);
  const existing = storedCredential(user);
  if (existing) return existing;

  const credential = createFeedCredential(user.email);
  await prisma.user.updateMany({
    where: { id: userId, calendarFeedTokenHash: null },
    data: {
      calendarFeedTokenHash: credential.tokenHash,
      calendarFeedTokenEnc: credential.tokenEnc,
      calendarFeedTokenIssuedAt: credential.issuedAt,
    },
  });

  const persisted = storedCredential(await findFeedUser(userId));
  if (!persisted) throw new Error("Personal feed credential was not persisted");
  return persisted;
}

function personalFeedUrls(token: string): Pick<CalendarLinksResponse, "personalIcsUrl" | "personalWebcalUrl"> {
  const icsUrl = new URL(`/calendar/feed/${token}.ics`, config().BASE_URL);
  const personalIcsUrl = icsUrl.toString();
  return {
    personalIcsUrl,
    personalWebcalUrl: personalIcsUrl.replace(/^https:/, "webcal:"),
  };
}

export async function calendarLinksForUser(userId: string): Promise<CalendarLinksResponse> {
  const [user, appConfig] = await Promise.all([
    findFeedUser(userId),
    prisma.appConfig.findUnique({ where: { id: 1 }, select: { generalCalendarId: true } }),
  ]);
  const generalGoogleUrl = appConfig?.generalCalendarId
    ? generalGoogleCalendarUrl(appConfig.generalCalendarId)
    : null;

  if (!isPersonalFeedEligible(user)) {
    return {
      generalGoogleUrl,
      personalIcsUrl: null,
      personalWebcalUrl: null,
      personalFeedEligible: false,
      lastFetchedAt: null,
    };
  }

  const credential = await ensureUserFeedCredential(userId);
  return {
    generalGoogleUrl,
    ...personalFeedUrls(credential.token),
    personalFeedEligible: true,
    lastFetchedAt: credential.lastFetchedAt,
  };
}

export async function rotateUserFeedCredential(userId: string): Promise<CalendarLinksResponse> {
  const user = await findFeedUser(userId);
  if (!isPersonalFeedEligible(user)) throw new Error("User is not eligible for a personal feed");

  const credential = createFeedCredential(user.email);
  await prisma.user.update({
    where: { id: userId },
    data: {
      calendarFeedTokenHash: credential.tokenHash,
      calendarFeedTokenEnc: credential.tokenEnc,
      calendarFeedTokenIssuedAt: credential.issuedAt,
      calendarFeedLastFetchedAt: null,
    },
  });
  return calendarLinksForUser(userId);
}
