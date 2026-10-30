/* ==========================================================
   Costa Greca — Villa office (owner dashboard)
   Signs in with Supabase Auth. The database only lets emails
   listed in the owners table read or change anything.
   ========================================================== */

(() => {
  const { supabaseUrl, supabaseKey } = window.CG_PORTAL || {};
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fromIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmtDate = s => fromIso(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });

  const loginForm = $("#o-login");
  const loginError = $("#o-login-error");

  if (!supabaseUrl || !supabaseKey || !window.supabase) {
    $("#o-login-lede").textContent = "The guest database isn't connected yet.";
    loginForm.querySelectorAll("input, button").forEach(el => (el.disabled = true));
    return;
  }

  const db = window.supabase.createClient(supabaseUrl, supabaseKey);

  let toastTimer;
  function toast(text) {
    const t = $("#toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
  }
  function formMsg(form, text, ok = true) {
    const msg = form.querySelector(".r-form-msg");
    msg.textContent = text;
    msg.classList.toggle("bad", !ok);
  }

  /* ---------- Auth ---------- */
  async function start() {
    const { data } = await db.auth.getSession();
    if (!data.session) return showLogin();
    const { data: isOwner } = await db.rpc("is_owner");
    if (!isOwner) {
      await db.auth.signOut();
      return showLogin("This account isn't registered as an owner.");
    }
    $("#o-gate").hidden = true;
    $("#o-app").hidden = false;
    loadAll();
  }

  function showLogin(message = "") {
    $("#o-app").hidden = true;
    $("#o-gate").hidden = false;
    loginError.textContent = message;
  }

  loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    loginError.textContent = "";
    const btn = loginForm.querySelector("button");
    btn.disabled = true;
    const { error } = await db.auth.signInWithPassword({
      email: loginForm.email.value.trim(),
      password: loginForm.password.value
    });
    btn.disabled = false;
    if (error) return (loginError.textContent = "Email or password is incorrect.");
    loginForm.password.value = "";
    start();
  });

  $("#o-signout").addEventListener("click", async () => {
    await db.auth.signOut();
    showLogin();
  });

  /* ---------- Tabs ---------- */
  document.querySelectorAll("[data-tab]").forEach(tab => tab.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach(t => t.setAttribute("aria-selected", String(t === tab)));
    document.querySelectorAll("[data-panel]").forEach(p => (p.hidden = p.dataset.panel !== tab.dataset.tab));
  }));

  function loadAll() {
    loadRequests();
    loadBookings();
    loadSettings();
  }

  /* ---------- Requests ---------- */
  const STATUSES = ["requested", "confirmed", "declined", "done", "cancelled"];
  const LABEL = { requested: "Requested", confirmed: "Confirmed", declined: "Not available", done: "Done", cancelled: "Cancelled by guest" };
  let requests = [];

  function describe(r) {
    const d = r.details || {};
    const parts = [];
    if (r.requested_for) parts.push(fmtDate(r.requested_for));
    if (d.guests) parts.push(`${d.guests} guests`);
    if (d.items?.length) parts.push(d.items.map(x => `${x.qty} × ${x.item}`).join(", "));
    if (d.arrival) parts.push(`Arriving ${d.arrival}`);
    if (d.beds) parts.push(`Beds: ${d.beds}`);
    if (d.diet) parts.push(`Diet: ${d.diet}`);
    if (d.occasion) parts.push(`Occasion: ${d.occasion}`);
    if (d.notes) parts.push(d.notes);
    return parts.map(esc).join(" · ");
  }

  async function loadRequests() {
    const { data, error } = await db
      .from("guest_requests")
      .select("*, bookings(guest_name, check_in, check_out)")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) return toast("Couldn't load requests");
    requests = data;
    const open = requests.filter(r => r.status === "requested").length;
    const badge = $("#o-new-count");
    badge.textContent = open;
    badge.hidden = !open;
    renderRequests();
  }

  function renderRequests() {
    const filter = document.querySelector("#o-filter input:checked").value;
    const shown = requests.filter(r =>
      filter === "all" ? true : filter === "open" ? r.status === "requested" : r.status === "confirmed");
    $("#o-requests").innerHTML = shown.length ? shown.map(r => `
      <article class="o-req" data-id="${esc(r.id)}">
        <div>
          <p class="o-meta">${esc(r.bookings?.guest_name || "")} · ${r.bookings ? `${fmtDate(r.bookings.check_in)} to ${fmtDate(r.bookings.check_out)}` : ""}</p>
          <h3>${esc(r.title)}</h3>
          <p>${describe(r) || "—"}</p>
        </div>
        <div class="r-form">
          <label class="r-field"><span>Status</span>
            <select data-field="status">${STATUSES.map(s => `<option value="${s}" ${s === r.status ? "selected" : ""}>${LABEL[s]}</option>`).join("")}</select>
          </label>
          <label class="r-field"><span>Note to guest</span><input data-field="owner_note" maxlength="1000" value="${esc(r.owner_note || "")}" placeholder="e.g. Chef Maria, 20:00"></label>
          <button class="btn btn-outline" type="button" data-save>Save</button>
        </div>
      </article>`).join("")
      : `<p class="r-muted r-empty">No ${filter === "all" ? "" : filter} requests.</p>`;
  }

  $("#o-filter").addEventListener("change", renderRequests);
  $("#o-requests").addEventListener("click", async e => {
    const btn = e.target.closest("[data-save]");
    if (!btn) return;
    const card = btn.closest("[data-id]");
    btn.disabled = true;
    const { error } = await db.from("guest_requests").update({
      status: card.querySelector('[data-field="status"]').value,
      owner_note: card.querySelector('[data-field="owner_note"]').value.trim() || null
    }).eq("id", card.dataset.id);
    btn.disabled = false;
    if (error) return toast("Couldn't save. Please try again.");
    toast("Saved. The guest sees it straight away.");
    loadRequests();
  });

  /* ---------- Bookings ---------- */
  const bookingForm = $("#o-booking-form");
  let bookings = [];

  function invitation(b) {
    const link = new URL("guest.html", location.href).href;
    return `Dear ${b.guest_name},

Welcome to Costa Greca. Your private guest area is ready: arrival details, the villa guide and our concierge, all in one place.

${link}
Your personal code: ${b.code}

Your stay: ${fmtDate(b.check_in)} to ${fmtDate(b.check_out)}

We look forward to welcoming you.`;
  }

  async function loadBookings() {
    const { data, error } = await db.from("bookings").select("*").order("check_in", { ascending: true }).limit(500);
    if (error) return toast("Couldn't load bookings");
    bookings = data;
    $("#o-bookings").innerHTML = bookings.length ? bookings.map(b => `
      <tr class="${b.check_out < todayIso ? "o-past" : ""}" data-id="${esc(b.id)}">
        <td>${esc(b.guest_name)}<br><small class="r-muted">${b.adults + b.children} guests</small></td>
        <td>${fmtDate(b.check_in)}<br><small class="r-muted">to ${fmtDate(b.check_out)}</small></td>
        <td class="o-code">${esc(b.code)}</td>
        <td><button class="o-link" data-copy>Copy invite</button><button class="o-link danger" data-delete>Delete</button></td>
      </tr>`).join("")
      : `<tr><td colspan="4" class="r-muted">No bookings yet. Create one to generate a guest code.</td></tr>`;
  }

  bookingForm.addEventListener("submit", async e => {
    e.preventDefault();
    if (!bookingForm.reportValidity()) return;
    const f = bookingForm;
    if (f.check_out.value <= f.check_in.value) return formMsg(f, "Check-out must be after check-in.", false);
    const btn = f.querySelector("button[type=submit]");
    btn.disabled = true;
    const { data, error } = await db.from("bookings").insert({
      guest_name: f.guest_name.value.trim(),
      guest_email: f.guest_email.value.trim() || null,
      check_in: f.check_in.value,
      check_out: f.check_out.value,
      adults: Number(f.adults.value),
      children: Number(f.children.value),
      notes: f.notes.value.trim() || null
    }).select().single();
    btn.disabled = false;
    if (error) return formMsg(f, "Couldn't create the booking. Please check the details.", false);
    formMsg(f, `Created. Guest code: ${data.code}`);
    $("#o-invite").textContent = invitation(data);
    $("#o-invite-box").hidden = false;
    f.reset();
    loadBookings();
  });

  $("#o-copy-invite").addEventListener("click", () => {
    navigator.clipboard?.writeText($("#o-invite").textContent).then(() => toast("Invitation copied"));
  });

  $("#o-bookings").addEventListener("click", async e => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    const b = bookings.find(x => x.id === row.dataset.id);
    if (e.target.closest("[data-copy]")) {
      navigator.clipboard?.writeText(invitation(b)).then(() => toast("Invitation copied"));
    }
    if (e.target.closest("[data-delete]")) {
      if (!confirm(`Delete the booking for ${b.guest_name}? Their code and requests stop working immediately.`)) return;
      const { error } = await db.from("bookings").delete().eq("id", b.id);
      if (error) return toast("Couldn't delete the booking.");
      toast("Booking deleted");
      loadBookings();
      loadRequests();
    }
  });

  /* ---------- Villa details ---------- */
  const settingsForm = $("#o-settings-form");

  async function loadSettings() {
    const { data, error } = await db.from("villa_settings").select("*").order("sort");
    if (error) return toast("Couldn't load villa details");
    $("#o-settings").innerHTML = data.map(s => `
      <label class="r-field ${s.visibility === "stay" ? "o-private" : ""}"><span>${esc(s.label)}</span>
        <input data-key="${esc(s.key)}" maxlength="500" value="${esc(s.value)}"></label>`).join("");
  }

  settingsForm.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = settingsForm.querySelector("button[type=submit]");
    btn.disabled = true;
    const updates = [...settingsForm.querySelectorAll("[data-key]")].map(i =>
      db.from("villa_settings").update({ value: i.value.trim() }).eq("key", i.dataset.key));
    const results = await Promise.all(updates);
    btn.disabled = false;
    if (results.some(r => r.error)) return formMsg(settingsForm, "Some details couldn't be saved.", false);
    formMsg(settingsForm, "Saved.");
    toast("Villa details saved");
  });

  start();
})();
