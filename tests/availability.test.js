import { test } from "node:test";
import assert from "node:assert/strict";
import { vilniusNow, addDays, daysBetween, weekdayOf, computeAvailability } from "../public/js/availability.js";

const at = (iso) => new Date(iso);
const weekdays = (open, close) => ({
  mon: [open, close], tue: [open, close], wed: [open, close], thu: [open, close], fri: [open, close], sat: null, sun: null,
});
const provider = (overrides = {}) => ({ hours: weekdays("08:00", "17:00"), leadTimeDays: 0, emergency: false, ...overrides });

// 2026-11-25 is a Wednesday. Vilnius is UTC+2 in winter and UTC+3 in summer.
const WED_1000 = at("2026-11-25T08:00:00Z");

test("AC4.1 date, weekday and time are read in Europe/Vilnius", () => {
  assert.deepEqual(vilniusNow(WED_1000), { date: "2026-11-25", weekday: "wed", time: "10:00" });
});

test("AC4.1 late evening UTC is already the next day in Vilnius", () => {
  assert.deepEqual(vilniusNow(at("2026-11-25T22:30:00Z")), { date: "2026-11-26", weekday: "thu", time: "00:30" });
});

test("AC4.1 midnight is 00:00, not 24:00", () => {
  assert.deepEqual(vilniusNow(at("2026-11-25T22:00:00Z")), { date: "2026-11-26", weekday: "thu", time: "00:00" });
});

test("AC4.1 clock change in October: summer time until 04:00, winter time after", () => {
  assert.deepEqual(vilniusNow(at("2026-10-24T22:30:00Z")), { date: "2026-10-25", weekday: "sun", time: "01:30" });
  assert.deepEqual(vilniusNow(at("2026-10-25T21:30:00Z")), { date: "2026-10-25", weekday: "sun", time: "23:30" });
  assert.deepEqual(vilniusNow(at("2026-10-25T22:30:00Z")), { date: "2026-10-26", weekday: "mon", time: "00:30" });
});

test("AC4.1 clock change in March: winter time before, summer time after", () => {
  assert.deepEqual(vilniusNow(at("2027-03-27T22:30:00Z")), { date: "2027-03-28", weekday: "sun", time: "00:30" });
  assert.deepEqual(vilniusNow(at("2027-03-28T21:30:00Z")), { date: "2027-03-29", weekday: "mon", time: "00:30" });
});

test("AC4.1 day arithmetic works on calendar dates across clock changes, months and years", () => {
  assert.equal(addDays("2026-10-24", 2), "2026-10-26");
  assert.equal(addDays("2027-03-27", 2), "2027-03-29");
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-11-25", 0), "2026-11-25");
  assert.equal(daysBetween("2026-10-24", "2026-10-26"), 2);
  assert.equal(daysBetween("2027-03-27", "2027-03-29"), 2);
  assert.equal(daysBetween("2026-11-25", "2026-11-25"), 0);
  assert.equal(weekdayOf("2026-11-25"), "wed");
  assert.equal(weekdayOf("2026-11-29"), "sun");
  assert.equal(weekdayOf("2026-11-30"), "mon");
});

test("AC4.2 openNow: open at opening time, open one minute before closing, closed at closing time", () => {
  assert.equal(computeAvailability(provider(), at("2026-11-25T05:59:00Z")).openNow, false); // 07:59
  assert.equal(computeAvailability(provider(), at("2026-11-25T06:00:00Z")).openNow, true); // 08:00
  assert.equal(computeAvailability(provider(), at("2026-11-25T14:59:00Z")).openNow, true); // 16:59
  assert.equal(computeAvailability(provider(), at("2026-11-25T15:00:00Z")).openNow, false); // 17:00
  assert.equal(computeAvailability(provider(), at("2026-11-25T15:01:00Z")).openNow, false); // 17:01
});

test("AC4.2 openNow is false on a closed day and always true for emergency providers", () => {
  const saturdayNoon = at("2026-11-28T10:00:00Z");
  assert.equal(computeAvailability(provider(), saturdayNoon).openNow, false);
  assert.equal(computeAvailability(provider({ emergency: true }), saturdayNoon).openNow, true);
  assert.equal(computeAvailability(provider({ emergency: true }), at("2026-11-25T01:00:00Z")).openNow, true); // 03:00
});

test("AC4.3 lead time 0 before closing on a working day answers today", () => {
  assert.equal(computeAvailability(provider(), WED_1000).nextFreeDate, "2026-11-25");
  assert.equal(computeAvailability(provider(), at("2026-11-25T04:00:00Z")).nextFreeDate, "2026-11-25"); // 06:00, before opening
  assert.equal(computeAvailability(provider(), at("2026-11-25T14:59:00Z")).nextFreeDate, "2026-11-25"); // 16:59
});

test("AC4.3 lead time 0 at or after closing answers the next working day", () => {
  assert.equal(computeAvailability(provider(), at("2026-11-25T15:00:00Z")).nextFreeDate, "2026-11-26"); // 17:00
  assert.equal(computeAvailability(provider(), at("2026-11-25T19:00:00Z")).nextFreeDate, "2026-11-26"); // 21:00
});

test("AC4.3 lead time 0 on a closed day and Friday evening skip to Monday", () => {
  assert.equal(computeAvailability(provider(), at("2026-11-28T10:00:00Z")).nextFreeDate, "2026-11-30"); // Saturday
  assert.equal(computeAvailability(provider(), at("2026-11-29T10:00:00Z")).nextFreeDate, "2026-11-30"); // Sunday
  assert.equal(computeAvailability(provider(), at("2026-11-27T16:00:00Z")).nextFreeDate, "2026-11-30"); // Friday 18:00
});

test("AC4.3 lead time above 0 ignores the time of day", () => {
  const twoDays = provider({ leadTimeDays: 2 });
  assert.equal(computeAvailability(twoDays, WED_1000).nextFreeDate, "2026-11-27"); // Wed + 2 = Fri
  assert.equal(computeAvailability(twoDays, at("2026-11-25T19:00:00Z")).nextFreeDate, "2026-11-27"); // after closing, still Fri
});

test("AC4.3 lead time landing on a closed day moves to the next working day", () => {
  assert.equal(computeAvailability(provider({ leadTimeDays: 3 }), WED_1000).nextFreeDate, "2026-11-30"); // Sat -> Mon
  assert.equal(computeAvailability(provider({ leadTimeDays: 10 }), WED_1000).nextFreeDate, "2026-12-07"); // Sat 5 Dec -> Mon
});

test("AC4.3 a provider working one day a week is found within the week", () => {
  const sundaysOnly = provider({ hours: { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: ["10:00", "14:00"] } });
  assert.equal(computeAvailability(sundaysOnly, WED_1000).nextFreeDate, "2026-11-29");
  assert.equal(computeAvailability(sundaysOnly, at("2026-11-29T12:00:00Z")).nextFreeDate, "2026-12-06"); // Sunday 14:00, closed
});

test("AC4.3 emergency providers answer today even on a closed day or at night", () => {
  const emergency = provider({ emergency: true });
  assert.equal(computeAvailability(emergency, at("2026-11-28T21:00:00Z")).nextFreeDate, "2026-11-28"); // Saturday 23:00
  assert.equal(computeAvailability(emergency, at("2026-11-25T19:00:00Z")).nextFreeDate, "2026-11-25");
});

test("AC4.3 the date used is the Vilnius date, not the UTC date", () => {
  // 00:30 on Thursday 26 Nov in Vilnius, still 25 Nov in UTC.
  const result = computeAvailability(provider(), at("2026-11-25T22:30:00Z"));
  assert.equal(result.nextFreeDate, "2026-11-26");
  assert.equal(result.openNow, false);
});

test("AC4.3 lead time is counted in calendar days across the October clock change", () => {
  // Saturday 24 Oct 2026, 12:00 Vilnius. Lead time 2 -> Monday 26 Oct.
  assert.equal(computeAvailability(provider({ leadTimeDays: 2 }), at("2026-10-24T09:00:00Z")).nextFreeDate, "2026-10-26");
});

test("AC4.4 todayHours is the day's slot, or null when closed", () => {
  assert.deepEqual(computeAvailability(provider(), WED_1000).todayHours, ["08:00", "17:00"]);
  assert.equal(computeAvailability(provider(), at("2026-11-28T10:00:00Z")).todayHours, null);
});

test("AC4.5 daysUntilFree counts calendar days from today", () => {
  assert.equal(computeAvailability(provider(), WED_1000).daysUntilFree, 0);
  assert.equal(computeAvailability(provider({ leadTimeDays: 2 }), WED_1000).daysUntilFree, 2);
  assert.equal(computeAvailability(provider({ leadTimeDays: 3 }), WED_1000).daysUntilFree, 5);
});

test("the answer repeats the stored lead time and emergency flag", () => {
  const result = computeAvailability(provider({ leadTimeDays: 4 }), WED_1000);
  assert.equal(result.leadTimeDays, 4);
  assert.equal(result.emergency, false);
});
