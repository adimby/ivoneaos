import { describe, expect, it } from "vitest";
import { localDate, localDayDiff, parseLocalInput, startOfLocalDay, TIME_ZONE, toLocalInputValue } from "@/lib/time";
import { quickDueAt, snoozeDueAt, todayCutoff } from "./reminder-dates";

// 15 octobre 2026, 22 h 30 UTC = 16 octobre, 1 h 30 à Antananarivo (déjà le lendemain).
const lateUtc = new Date("2026-10-15T22:30:00Z");
// 15 octobre 2026, 10 h UTC = 13 h à Antananarivo.
const midday = new Date("2026-10-15T10:00:00Z");

describe("heure de Madagascar", () => {
  it("le fuseau Indian/Antananarivo est bien UTC+3 (pas d'heure d'été)", () => {
    for (const iso of ["2026-01-15T12:00:00Z", "2026-07-15T12:00:00Z"]) {
      const hour = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(new Date(iso));
      expect(hour).toBe("15");
    }
  });
  it("date du jour locale, pas UTC", () => {
    expect(localDate(lateUtc)).toBe("2026-10-16");
    expect(localDate(midday)).toBe("2026-10-15");
    expect(startOfLocalDay(midday).toISOString()).toBe("2026-10-14T21:00:00.000Z");
  });
  it("saisie datetime-local en heure locale", () => {
    expect(parseLocalInput("2026-10-20T14:30")?.toISOString()).toBe("2026-10-20T11:30:00.000Z");
    expect(toLocalInputValue(new Date("2026-10-20T11:30:00Z"))).toBe("2026-10-20T14:30");
    expect(parseLocalInput("2026-02-31T10:00")).toBeNull();
    expect(parseLocalInput("demain")).toBeNull();
  });
  it("écart en jours calendaires", () => {
    expect(localDayDiff(new Date("2026-10-16T05:00:00Z"), midday)).toBe(1);
    expect(localDayDiff(new Date("2026-10-15T20:59:00Z"), midday)).toBe(0);
    expect(localDayDiff(new Date("2026-10-15T21:00:00Z"), midday)).toBe(1);
    expect(localDayDiff(new Date("2026-10-13T08:00:00Z"), midday)).toBe(-2);
  });
});

describe("choix rapides", () => {
  it("demain, dans 3 jours, dans 1 semaine : 9 h heure de Madagascar", () => {
    expect(quickDueAt("tomorrow", midday).toISOString()).toBe("2026-10-16T06:00:00.000Z");
    expect(quickDueAt("in3days", midday).toISOString()).toBe("2026-10-18T06:00:00.000Z");
    expect(quickDueAt("in1week", midday).toISOString()).toBe("2026-10-22T06:00:00.000Z");
  });
  it("après minuit à Antananarivo (encore la veille en UTC), « demain » part du jour local", () => {
    expect(quickDueAt("tomorrow", lateUtc).toISOString()).toBe("2026-10-17T06:00:00.000Z");
  });
});

describe("repousser", () => {
  it("garde l'heure prévue, à partir d'aujourd'hui", () => {
    // Prévu le 10 octobre à 15 h (local), en retard : +1 jour → 16 octobre 15 h.
    const due = new Date("2026-10-10T12:00:00Z");
    expect(snoozeDueAt(due, 1, midday).toISOString()).toBe("2026-10-16T12:00:00.000Z");
    expect(snoozeDueAt(due, 3, midday).toISOString()).toBe("2026-10-18T12:00:00.000Z");
    expect(snoozeDueAt(due, 7, midday).toISOString()).toBe("2026-10-22T12:00:00.000Z");
  });
  it("un rappel à venir recule à partir de sa date, jamais vers aujourd'hui", () => {
    // Prévu dans 1 semaine (22 octobre, 9 h local) : +1 jour → 23 octobre 9 h.
    const inAWeek = new Date("2026-10-22T06:00:00Z");
    expect(snoozeDueAt(inAWeek, 1, midday).toISOString()).toBe("2026-10-23T06:00:00.000Z");
    expect(snoozeDueAt(inAWeek, 7, midday).toISOString()).toBe("2026-10-29T06:00:00.000Z");
    // Prévu demain (16 octobre, 9 h local) : +1 jour → 17, +1 semaine → 23.
    const tomorrow = new Date("2026-10-16T06:00:00Z");
    expect(snoozeDueAt(tomorrow, 1, midday).toISOString()).toBe("2026-10-17T06:00:00.000Z");
    expect(snoozeDueAt(tomorrow, 3, midday).toISOString()).toBe("2026-10-19T06:00:00.000Z");
    expect(snoozeDueAt(tomorrow, 7, midday).toISOString()).toBe("2026-10-23T06:00:00.000Z");
  });
  it("un rappel d'aujourd'hui recule de N jours à la même heure", () => {
    // Aujourd'hui 15 octobre à 18 h local (15 h UTC), il est 13 h : +1 jour → 16 octobre 18 h.
    expect(snoozeDueAt(new Date("2026-10-15T15:00:00Z"), 1, midday).toISOString()).toBe("2026-10-16T15:00:00.000Z");
  });
});

describe("Aujourd'hui", () => {
  it("jusqu'à minuit heure locale", () => {
    expect(todayCutoff(midday).toISOString()).toBe("2026-10-15T21:00:00.000Z");
    expect(todayCutoff(lateUtc).toISOString()).toBe("2026-10-16T21:00:00.000Z");
  });
});
