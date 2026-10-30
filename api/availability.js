// Vercel serverless function: GET /api/availability
//
// Reads the iCal (.ics) calendar exports of your Airbnb and Booking.com
// listings and returns the booked date ranges, so the website calendar
// blocks the same nights. Set the URLs as environment variables in Vercel:
//
//   AIRBNB_ICAL_URL   Airbnb > Listing > Availability > Sync calendars > Export calendar
//   BOOKING_ICAL_URL  Booking.com extranet > Rates & Availability > Sync calendars > Export
//   EXTRA_ICAL_URLS   optional, comma-separated (e.g. a VRBO or Google calendar)
//
// Response: { "booked": [{ "start": "2027-06-12", "end": "2027-06-19" }, ...] }
// "end" is the check-out day and is exclusive (that night is free).

const toIsoDate = value => {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

function parseIcs(text) {
  // Unfold continuation lines (RFC 5545: lines starting with a space or tab)
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const ranges = [];
  let current = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = {};
    else if (line === "END:VEVENT") {
      if (current?.start && current?.end && current.end > current.start) ranges.push(current);
      current = null;
    } else if (current) {
      const [key, ...rest] = line.split(":");
      const value = rest.join(":");
      if (key.startsWith("DTSTART")) current.start = toIsoDate(value);
      if (key.startsWith("DTEND")) current.end = toIsoDate(value);
    }
  }
  return ranges;
}

export default async function handler(req, res) {
  const urls = [
    process.env.AIRBNB_ICAL_URL,
    process.env.BOOKING_ICAL_URL,
    ...(process.env.EXTRA_ICAL_URLS || "").split(",")
  ].map(u => u && u.trim()).filter(Boolean);

  const today = new Date().toISOString().slice(0, 10);
  const results = await Promise.allSettled(
    urls.map(url => fetch(url, { headers: { "User-Agent": "CostaGreca-Calendar/1.0" } }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    }))
  );

  const booked = results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => parseIcs(r.value))
    .filter(r => r.end > today)
    .sort((a, b) => a.start.localeCompare(b.start));

  results.forEach((r, i) => {
    if (r.status === "rejected") console.error(`Calendar ${i + 1} failed:`, r.reason?.message);
  });

  // Cache at the edge for 15 minutes so the calendars are not fetched on every visit.
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
  res.status(200).json({ booked });
}
