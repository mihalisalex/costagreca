// Guest portal rules shared by api/guest.js and api/owner.js.
import crypto from "node:crypto";

export const todayAthens = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const isIsoDate = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
export const isUuid = v => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/* ---------- Booking codes ---------- */

// Codes look like CG-7KQM-X3PD (no 0/O/1/I/L to avoid confusion).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newCode() {
  let s = "";
  for (const b of crypto.randomBytes(8)) s += ALPHABET[b % ALPHABET.length];
  return `CG-${s.slice(0, 4)}-${s.slice(4)}`;
}

// Accepts what guests actually type: "cg 7kqm x3pd", "7KQMX3PD", ...
export function normalizeCode(typed) {
  let v = String(typed ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!v.startsWith("CG")) v = `CG${v}`;
  return v.length === 10 ? `CG-${v.slice(2, 6)}-${v.slice(6)}` : null;
}

/* ---------- Rate limiting (10 wrong tries per 15 minutes) ---------- */

export async function isLockedOut(db, scope) {
  await db.query("delete from login_attempts where at < now() - interval '1 day'");
  const { rows } = await db.query(
    "select count(*)::int as n from login_attempts where scope = $1 and not ok and at > now() - interval '15 minutes'",
    [scope]
  );
  return rows[0].n >= 10;
}

export const logAttempt = (db, scope, ok) =>
  db.query("insert into login_attempts (scope, ok) values ($1, $2)", [scope, ok]);

/* ---------- Guests ---------- */

export const BOOKING_COLUMNS =
  "id, code, guest_name, guest_email, check_in::text as check_in, check_out::text as check_out, adults, children, notes, created_at";

// Codes stop working three days after check-out.
export async function findGuestBooking(db, typedCode, ip) {
  const scope = `guest:${ip}`;
  if (await isLockedOut(db, scope)) return { error: "too_many_attempts" };
  const code = normalizeCode(typedCode);
  let booking = null;
  if (code) {
    const { rows } = await db.query(
      `select ${BOOKING_COLUMNS} from bookings where code = $1 and check_out >= $2::date`,
      [code, addDays(todayAthens(), -3)]
    );
    booking = rows[0] || null;
  }
  await logAttempt(db, scope, !!booking);
  return booking ? { booking } : { error: "invalid_code" };
}

export function stayPhase(booking, today = todayAthens()) {
  if (today < booking.check_in) return "before";
  if (today <= booking.check_out) return "stay";
  return "after";
}

export async function guestSession(db, booking) {
  const today = todayAthens();
  const phase = stayPhase(booking, today);
  const settings = await db.query(
    "select key, label, value from villa_settings where value <> '' and (visibility = 'booking' or $1) order by sort",
    [phase === "stay"]
  );
  const requests = await db.query(
    `select id, kind, title, details, requested_for::text as requested_for, status, owner_note, created_at
       from guest_requests where booking_id = $1 order by created_at desc`,
    [booking.id]
  );
  return {
    booking: {
      code: booking.code, guest_name: booking.guest_name,
      check_in: booking.check_in, check_out: booking.check_out,
      adults: booking.adults, children: booking.children
    },
    phase,
    today,
    settings: Object.fromEntries(settings.rows.map(s => [s.key, { label: s.label, value: s.value }])),
    requests: requests.rows
  };
}

export const REQUEST_KINDS = ["experience", "provisions", "preferences", "housekeeping"];
export const REQUEST_STATUSES = ["requested", "confirmed", "declined", "done", "cancelled"];

export async function addGuestRequest(db, booking, { kind, title, details, requested_for }) {
  if (stayPhase(booking) === "after") return { error: "stay_ended" };
  const cleanDetails = details && typeof details === "object" && !Array.isArray(details) ? details : {};
  if (!REQUEST_KINDS.includes(kind)
      || typeof title !== "string" || title.trim().length < 1 || title.length > 160
      || JSON.stringify(cleanDetails).length > 4000
      || (requested_for != null && !isIsoDate(requested_for))) {
    return { error: "invalid_request" };
  }
  const { rows: [{ n }] } = await db.query("select count(*)::int as n from guest_requests where booking_id = $1", [booking.id]);
  if (n >= 60) return { error: "too_many_requests" };
  const { rows } = await db.query(
    `insert into guest_requests (booking_id, kind, title, details, requested_for)
     values ($1, $2, $3, $4::jsonb, $5) returning id, status`,
    [booking.id, kind, title.trim(), JSON.stringify(cleanDetails), requested_for || null]
  );
  return rows[0];
}

export async function cancelGuestRequest(db, booking, id) {
  if (!isUuid(id)) return { cancelled: false };
  const { rowCount } = await db.query(
    "update guest_requests set status = 'cancelled', updated_at = now() where id = $1 and booking_id = $2 and status = 'requested'",
    [id, booking.id]
  );
  return { cancelled: rowCount === 1 };
}
