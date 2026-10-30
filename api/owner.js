// POST /api/owner  — the villa office. Sign in with the OWNER_PASSWORD set in
// Vercel; every other action needs the signed session token that login returns.
import crypto from "node:crypto";
import { getDb } from "./_lib/db.js";
import { clientIp, route, send } from "./_lib/http.js";
import {
  BOOKING_COLUMNS, REQUEST_STATUSES, isIsoDate, isUuid, isLockedOut, logAttempt, newCode
} from "./_lib/portal.js";

const SESSION_DAYS = 7;
const sha256 = s => crypto.createHash("sha256").update(s).digest();

// Changing OWNER_PASSWORD signs every device out.
function signingKey() {
  return sha256(`cg-owner|${process.env.OWNER_PASSWORD}|${process.env.DATABASE_URL || process.env.POSTGRES_URL || ""}`);
}

function issueToken() {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const sig = crypto.createHmac("sha256", signingKey()).update(String(exp)).digest("base64url");
  return `${exp}.${sig}`;
}

function validToken(header) {
  const token = String(header || "").replace(/^Bearer\s+/i, "");
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  const expected = crypto.createHmac("sha256", signingKey()).update(exp).digest("base64url");
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

const text = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const int = (v, min, max) => (Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : null);

export default route(async (req, res, body) => {
  if (!process.env.OWNER_PASSWORD) return send(res, 200, { error: "not_configured" });
  const db = await getDb();

  if (body.action === "login") {
    const scope = `owner:${clientIp(req)}`;
    if (await isLockedOut(db, scope)) return send(res, 200, { error: "too_many_attempts" });
    const ok = typeof body.password === "string"
      && crypto.timingSafeEqual(sha256(body.password), sha256(process.env.OWNER_PASSWORD));
    await logAttempt(db, scope, ok);
    return send(res, 200, ok ? { token: issueToken() } : { error: "wrong_password" });
  }

  if (!validToken(req.headers.authorization)) return send(res, 401, { error: "signed_out" });

  switch (body.action) {
    case "bookings.list": {
      const { rows } = await db.query(`select ${BOOKING_COLUMNS} from bookings order by check_in asc limit 500`);
      return send(res, 200, { bookings: rows });
    }

    case "bookings.create": {
      const b = {
        guest_name: text(body.guest_name, 120),
        guest_email: text(body.guest_email, 200),
        check_in: body.check_in, check_out: body.check_out,
        adults: int(body.adults, 1, 14), children: int(body.children ?? 0, 0, 13),
        notes: text(body.notes, 2000)
      };
      if (!b.guest_name || !isIsoDate(b.check_in) || !isIsoDate(b.check_out) || b.check_out <= b.check_in
          || b.adults === null || b.children === null) {
        return send(res, 200, { error: "invalid_booking" });
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const { rows } = await db.query(
            `insert into bookings (code, guest_name, guest_email, check_in, check_out, adults, children, notes)
             values ($1, $2, $3, $4, $5, $6, $7, $8) returning ${BOOKING_COLUMNS}`,
            [newCode(), b.guest_name, b.guest_email, b.check_in, b.check_out, b.adults, b.children, b.notes]
          );
          return send(res, 200, { booking: rows[0] });
        } catch (err) {
          if (err.code !== "23505") throw err; // retry only on a (very unlikely) duplicate code
        }
      }
      return send(res, 500, { error: "server_error" });
    }

    case "bookings.delete": {
      if (!isUuid(body.id)) return send(res, 200, { error: "invalid_id" });
      await db.query("delete from bookings where id = $1", [body.id]);
      return send(res, 200, { deleted: true });
    }

    case "requests.list": {
      const { rows } = await db.query(
        `select r.id, r.kind, r.title, r.details, r.requested_for::text as requested_for, r.status, r.owner_note, r.created_at,
                b.guest_name, b.check_in::text as check_in, b.check_out::text as check_out
           from guest_requests r join bookings b on b.id = r.booking_id
          order by r.created_at desc limit 300`
      );
      return send(res, 200, { requests: rows });
    }

    case "requests.update": {
      if (!isUuid(body.id) || !REQUEST_STATUSES.includes(body.status)) return send(res, 200, { error: "invalid_request" });
      await db.query(
        "update guest_requests set status = $2, owner_note = $3, updated_at = now() where id = $1",
        [body.id, body.status, text(body.owner_note, 1000)]
      );
      return send(res, 200, { saved: true });
    }

    case "settings.list": {
      const { rows } = await db.query("select key, label, value, visibility from villa_settings order by sort");
      return send(res, 200, { settings: rows });
    }

    case "settings.save": {
      const values = body.values && typeof body.values === "object" ? body.values : {};
      for (const [key, value] of Object.entries(values)) {
        await db.query("update villa_settings set value = $2 where key = $1", [String(key), String(value ?? "").trim().slice(0, 500)]);
      }
      return send(res, 200, { saved: true });
    }

    default:
      return send(res, 400, { error: "unknown_action" });
  }
});
