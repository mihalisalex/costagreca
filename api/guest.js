// POST /api/guest  — the guest area's only door into the database.
// Every call carries the booking code; nothing is returned without a valid one.
import { getDb } from "./_lib/db.js";
import { clientIp, route, send } from "./_lib/http.js";
import { findGuestBooking, guestSession, addGuestRequest, cancelGuestRequest } from "./_lib/portal.js";

export default route(async (req, res, body) => {
  const db = await getDb();
  const auth = await findGuestBooking(db, body.code, clientIp(req));
  if (auth.error) return send(res, 200, { error: auth.error });

  switch (body.action) {
    case "session":
      return send(res, 200, await guestSession(db, auth.booking));
    case "add_request":
      return send(res, 200, await addGuestRequest(db, auth.booking, body));
    case "cancel_request":
      return send(res, 200, await cancelGuestRequest(db, auth.booking, body.id));
    default:
      return send(res, 400, { error: "unknown_action" });
  }
});
