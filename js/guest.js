/* ==========================================================
   Costa Greca — Guest Residence
   Talks to /api/guest (Vercel + Neon), passing the booking code
   each time. On a local preview without the API, the code DEMO
   shows sample data.
   ========================================================== */

(() => {
  const CONTENT = window.CG_CONTENT;
  const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
  let demo = false;
  const STORE_KEY = "cg-guest-code";

  const $ = sel => document.querySelector(sel);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get() { try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(STORE_KEY, v); } catch (e) {} },
    clear() { try { localStorage.removeItem(STORE_KEY); } catch (e) {} }
  };

  let code = null;
  let session = null;

  /* ---------- API ---------- */
  const ACTIONS = { guest_session: "session", guest_add_request: "add_request", guest_cancel_request: "cancel_request" };

  async function rpc(name, args) {
    if (demo) return demoRpc(name, args);
    const res = await fetch("/api/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: ACTIONS[name], code: args.p_code, kind: args.p_kind, title: args.p_title,
        details: args.p_details, requested_for: args.p_requested_for, id: args.p_id
      })
    });
    // A plain static preview has no API: fall back to sample data there.
    if (LOCAL && (res.status === 404 || res.status === 501)) { demo = true; return demoRpc(name, args); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  const ERRORS = {
    invalid_code: "We couldn't find that code. Please check it and try again.",
    too_many_attempts: "Too many attempts. Please wait 15 minutes and try again.",
    stay_ended: "Your stay has ended, so new requests are closed. We hope to welcome you back.",
    invalid_request: "Something in that request wasn't right. Please try again.",
    too_many_requests: "You've reached the request limit. Please message your host directly."
  };

  /* ---------- Login ---------- */
  const gateForm = $("#gate-form");
  const gateError = $("#gate-error");
  const gateSubmit = $("#gate-submit");

  async function enter(typed, { silent = false } = {}) {
    gateSubmit.disabled = true;
    gateError.textContent = "";
    try {
      const data = await rpc("guest_session", { p_code: typed });
      if (data.error) {
        if (!silent) gateError.textContent = ERRORS[data.error] || ERRORS.invalid_code;
        store.clear();
        return;
      }
      code = data.booking.code;
      store.set(code);
      session = data;
      renderResidence();
    } catch (e) {
      if (!silent) gateError.textContent = "We couldn't connect. Please check your internet connection and try again.";
    } finally {
      gateSubmit.disabled = false;
    }
  }

  gateForm.addEventListener("submit", e => {
    e.preventDefault();
    const typed = $("#gate-code").value.trim();
    if (!typed) return (gateError.textContent = "Please enter your booking code.");
    enter(typed);
  });

  $("#signout").addEventListener("click", () => {
    store.clear();
    code = session = null;
    $("#residence").hidden = true;
    $("#gate").hidden = false;
    $("#gate-code").value = "";
    window.scrollTo(0, 0);
  });

  async function refresh() {
    const data = await rpc("guest_session", { p_code: code });
    if (!data.error) { session = data; renderRequests(); }
  }

  /* ---------- Rendering ---------- */
  const fromIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmtDate = s => fromIso(s).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" });
  const daysBetween = (a, b) => Math.round((fromIso(b) - fromIso(a)) / 86400000);
  const setting = key => session.settings[key]?.value || "";

  function renderResidence() {
    const b = session.booking;
    $("#gate").hidden = true;
    $("#residence").hidden = false;
    window.scrollTo(0, 0);

    $("#w-name").textContent = b.guest_name;
    $("#w-dates").textContent = `${fmtDate(b.check_in)} to ${fmtDate(b.check_out)} · ${b.adults + b.children} guests`;

    const countdown = $("#w-countdown");
    if (session.phase === "before") {
      const days = daysBetween(session.today, b.check_in);
      $("#w-eyebrow").textContent = "Your stay is coming";
      countdown.innerHTML = `<span class="cd-num">${days}</span><span class="cd-label">${days === 1 ? "day" : "days"} until you arrive</span>`;
    } else if (session.phase === "stay") {
      const day = daysBetween(b.check_in, session.today) + 1;
      const total = daysBetween(b.check_in, b.check_out);
      $("#w-eyebrow").textContent = "Welcome to Costa Greca";
      countdown.innerHTML = `<span class="cd-num">${Math.min(day, total)}</span><span class="cd-label">day of ${total} at the villa</span>`;
    } else {
      $("#w-eyebrow").textContent = "Thank you";
      countdown.innerHTML = `<span class="cd-label">Thank you for staying with us. We hope to welcome you back.</span>`;
    }

    renderForecast();
    renderArrival();
    renderVilla();
    renderGuide();
    renderConcierge();
    renderRequests();

    const host = setting("host_name");
    const wa = setting("host_whatsapp");
    $("#footer-host").innerHTML = wa
      ? `Questions at any time? <a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">Message ${esc(host || "your host")} on WhatsApp</a>`
      : `Questions at any time? Message your host.`;
  }

  async function renderForecast() {
    const b = session.booking;
    const el = $("#w-forecast");
    el.hidden = true;
    const start = b.check_in > session.today ? b.check_in : session.today;
    if (daysBetween(session.today, start) > 14 || session.phase === "after") return;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=35.33&longitude=25.19&daily=weather_code,temperature_2m_max&timezone=Europe%2FAthens&forecast_days=16`;
      const d = await (await fetch(url)).json();
      const icon = c => (c === 0 ? "☀" : c <= 3 ? "⛅" : c <= 48 ? "☁" : c <= 67 || (c >= 80 && c <= 82) ? "☂" : c >= 95 ? "⚡" : "☁");
      const days = d.daily.time
        .map((t, i) => ({ t, code: d.daily.weather_code[i], max: Math.round(d.daily.temperature_2m_max[i]) }))
        .filter(x => x.t >= start && x.t < b.check_out)
        .slice(0, 7);
      if (!days.length) return;
      el.innerHTML = days.map(x => `
        <div class="fc-day"><span class="fc-name">${fromIso(x.t).toLocaleDateString("en-GB", { weekday: "short" })}</span>
        <span class="fc-icon" aria-hidden="true">${icon(x.code)}</span><span class="fc-temp">${x.max}°</span></div>`).join("");
      el.hidden = false;
    } catch (e) { /* forecast is a nice-to-have */ }
  }

  function row(label, value) {
    return value ? `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>` : "";
  }

  function renderArrival() {
    const address = setting("address");
    $("#arrival-list").innerHTML =
      row("Address", address) +
      row("Check-in from", setting("checkin_time")) +
      row("Check-out by", setting("checkout_time")) +
      row("Your host", setting("host_name")) ||
      `<p class="r-muted">Your host will share the address and arrival details before your stay.</p>`;

    const maps = setting("maps_link") || (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : "");
    const wa = setting("host_whatsapp");
    $("#arrival-actions").innerHTML =
      (maps ? `<a class="btn btn-gold" href="${esc(maps)}" target="_blank" rel="noopener">Open in Google Maps</a>` : "") +
      (wa ? `<a class="btn btn-outline" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">WhatsApp your host</a>` : "");

    const card = $("#codes-card");
    if (session.phase === "stay") {
      const gate = setting("gate_code");
      const door = setting("door_code");
      card.innerHTML = `<h3>Your access codes</h3>` + (gate || door
        ? `<div class="code-tiles">${gate ? `<div class="code-tile"><span>Gate</span><strong>${esc(gate)}</strong></div>` : ""}${door ? `<div class="code-tile"><span>Door</span><strong>${esc(door)}</strong></div>` : ""}</div>
           <p class="r-muted">Please keep these codes private.</p>`
        : `<p class="r-muted">Your host will give you access on arrival.</p>`);
    } else if (session.phase === "before") {
      card.innerHTML = `
        <div class="lock" aria-hidden="true"><svg viewBox="0 0 32 32"><rect x="7" y="14" width="18" height="13" rx="1"/><path d="M11 14V10a5 5 0 0 1 10 0v4"/></svg></div>
        <h3>Your access codes</h3>
        <p class="r-muted">For your security, the gate and door codes appear here on <strong>${esc(fmtDate(session.booking.check_in))}</strong>, the day you arrive.</p>`;
    } else {
      card.innerHTML = `<h3>Your access codes</h3><p class="r-muted">Your stay has ended and the codes are no longer active.</p>`;
    }
  }

  function renderVilla() {
    const wifiName = setting("wifi_name");
    const wifiPass = setting("wifi_password");
    const wifi = $("#wifi-card");
    if (session.phase === "stay" && wifiName) {
      wifi.innerHTML = `
        <h3>Wi-Fi</h3>
        <div class="wifi-body">
          <div class="wifi-qr" id="wifi-qr" aria-label="Scan to join the Wi-Fi"></div>
          <dl class="r-list">${row("Network", wifiName)}${row("Password", wifiPass)}</dl>
        </div>
        ${wifiPass ? `<button class="btn btn-outline" type="button" id="copy-wifi">Copy password</button>` : ""}`;
      const drawQr = () => {
        if (!window.qrcode) return setTimeout(drawQr, 200);
        const esc2 = s => s.replace(/([\\;,:"])/g, "\\$1");
        const qr = window.qrcode(0, "M");
        qr.addData(`WIFI:T:WPA;S:${esc2(wifiName)};P:${esc2(wifiPass)};;`);
        qr.make();
        $("#wifi-qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
      };
      drawQr();
      $("#copy-wifi")?.addEventListener("click", () => {
        navigator.clipboard?.writeText(wifiPass).then(() => toast("Wi-Fi password copied"));
      });
    } else {
      wifi.innerHTML = `
        <div class="lock" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M4 12a17 17 0 0 1 24 0M8 16.5a11 11 0 0 1 16 0M12 21a5 5 0 0 1 8 0"/><circle cx="16" cy="25" r="1.2"/></svg></div>
        <h3>Wi-Fi</h3>
        <p class="r-muted">${session.phase === "before" ? "The network name, password and a scan-to-join code appear here when you arrive." : "Wi-Fi details are shown during your stay."}</p>`;
    }

    $("#house-list").innerHTML =
      row("Check-in from", setting("checkin_time")) +
      row("Check-out by", setting("checkout_time")) +
      row("Emergency (Europe-wide)", setting("emergency") || "112") +
      row("Your host", setting("host_name"));

    $("#manual").innerHTML = CONTENT.manual.map(s => `
      <details class="r-acc">
        <summary>${esc(s.title)}</summary>
        <ul>${s.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>
      </details>`).join("");
  }

  function renderGuide() {
    $("#guide-list").innerHTML = CONTENT.guide.map((g, i) => `
      <article class="g-card">
        <span class="g-num">${String(i + 1).padStart(2, "0")}</span>
        <span class="g-tag">${esc(g.tag)}</span>
        <h3>${esc(g.name)}</h3>
        <p>${esc(g.text)}</p>
        <a class="link-arrow" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(g.maps)}" target="_blank" rel="noopener">Map</a>
      </article>`).join("");
  }

  /* ---------- Concierge ---------- */
  function renderConcierge() {
    const open = session.phase !== "after";
    $("#experiences").innerHTML = CONTENT.experiences.map(x => `
      <article class="x-card">
        <h3>${esc(x.title)}</h3>
        <p>${esc(x.text)}</p>
        <button class="btn btn-outline" type="button" data-exp="${esc(x.id)}" ${open ? "" : "disabled"}>Request</button>
      </article>`).join("");

    $("#provisions").innerHTML = CONTENT.provisions.map((p, i) => `
      <div class="prov">
        <span>${esc(p)}</span>
        <div class="stepper" data-i="${i}">
          <button type="button" data-step="-1" aria-label="Fewer ${esc(p)}">−</button>
          <output>0</output>
          <button type="button" data-step="1" aria-label="More ${esc(p)}">+</button>
        </div>
      </div>`).join("");

    $("#housekeeping").innerHTML = CONTENT.housekeeping.map(h => `
      <label class="chip"><input type="checkbox" value="${esc(h)}"><span>${esc(h)}</span></label>`).join("");
    $("#housekeeping-form").hidden = session.phase !== "stay";

    document.querySelectorAll(".r-forms button[type=submit]").forEach(b => (b.disabled = !open));
  }

  $("#provisions").addEventListener("click", e => {
    const btn = e.target.closest("[data-step]");
    if (!btn) return;
    const out = btn.parentElement.querySelector("output");
    out.value = out.textContent = Math.max(0, Math.min(20, Number(out.textContent) + Number(btn.dataset.step)));
  });

  function formMsg(form, text, ok = true) {
    const msg = form.querySelector(".r-form-msg");
    msg.textContent = text;
    msg.classList.toggle("bad", !ok);
  }

  async function send(form, kind, title, details, requestedFor = null) {
    const btn = form.querySelector("button[type=submit]:not([value=cancel])");
    if (btn) btn.disabled = true;
    try {
      const res = await rpc("guest_add_request", {
        p_code: code, p_kind: kind, p_title: title, p_details: details, p_requested_for: requestedFor
      });
      if (res.error) { formMsg(form, ERRORS[res.error] || ERRORS.invalid_request, false); return false; }
      formMsg(form, "");
      toast("Request sent. We'll confirm personally.");
      await refresh();
      return true;
    } catch (e) {
      formMsg(form, "We couldn't send that. Please try again.", false);
      return false;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  $("#provisions-form").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const items = [...form.querySelectorAll(".stepper")]
      .map(s => ({ item: CONTENT.provisions[s.dataset.i], qty: Number(s.querySelector("output").textContent) }))
      .filter(x => x.qty > 0);
    const notes = form.notes.value.trim();
    if (!items.length && !notes) return formMsg(form, "Choose at least one item.", false);
    if (await send(form, "provisions", "Fridge pre-stocking", { items, notes })) {
      form.reset();
      form.querySelectorAll("output").forEach(o => (o.textContent = "0"));
    }
  });

  $("#preferences-form").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const details = {
      arrival: form.arrival.value, beds: form.beds.value.trim(),
      diet: form.diet.value.trim(), occasion: form.occasion.value.trim()
    };
    if (!Object.values(details).some(Boolean)) return formMsg(form, "Fill in at least one preference.", false);
    if (await send(form, "preferences", "Stay preferences", details)) form.reset();
  });

  $("#housekeeping-form").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const picked = [...form.querySelectorAll("input[type=checkbox]:checked")].map(i => i.value);
    if (!picked.length) return formMsg(form, "Choose what you need.", false);
    if (await send(form, "housekeeping", picked.join(", "), { notes: form.notes.value.trim() })) form.reset();
  });

  const dialog = $("#exp-dialog");
  const expForm = $("#exp-form");
  let currentExp = null;
  $("#experiences").addEventListener("click", e => {
    const btn = e.target.closest("[data-exp]");
    if (!btn) return;
    currentExp = CONTENT.experiences.find(x => x.id === btn.dataset.exp);
    $("#exp-title").textContent = currentExp.title;
    expForm.reset();
    formMsg(expForm, "");
    expForm.date.min = session.today;
    expForm.date.max = session.booking.check_out;
    expForm.date.value = session.booking.check_in > session.today ? session.booking.check_in : session.today;
    expForm.guests.value = Math.min(14, session.booking.adults + session.booking.children);
    dialog.showModal();
  });
  expForm.addEventListener("submit", async e => {
    if (e.submitter?.value !== "send") return;
    e.preventDefault();
    if (!expForm.reportValidity()) return;
    const ok = await send(expForm, "experience", currentExp.title,
      { guests: Number(expForm.guests.value), notes: expForm.notes.value.trim() }, expForm.date.value);
    if (ok) dialog.close();
  });

  /* ---------- Requests ---------- */
  const STATUS = { requested: "Requested", confirmed: "Confirmed", declined: "Not available", done: "Done", cancelled: "Cancelled" };

  function describe(r) {
    const d = r.details || {};
    const parts = [];
    if (r.requested_for) parts.push(fmtDate(r.requested_for));
    if (d.guests) parts.push(`${d.guests} guests`);
    if (d.items?.length) parts.push(d.items.map(x => `${x.qty} × ${x.item}`).join(", "));
    if (d.arrival) parts.push(`Arriving ${d.arrival}`);
    ["beds", "diet", "occasion", "notes"].forEach(k => d[k] && parts.push(d[k]));
    return parts.map(esc).join(" · ");
  }

  function renderRequests() {
    const list = $("#request-list");
    if (!session.requests.length) {
      list.innerHTML = `<p class="r-muted r-empty">Nothing arranged yet. Your requests and their status appear here.</p>`;
      return;
    }
    list.innerHTML = session.requests.map(r => `
      <article class="req">
        <div class="req-main">
          <h3>${esc(r.title)}</h3>
          <p>${describe(r)}</p>
          ${r.owner_note ? `<p class="req-note">“${esc(r.owner_note)}”</p>` : ""}
        </div>
        <div class="req-side">
          <span class="pill pill-${esc(r.status)}">${STATUS[r.status] || esc(r.status)}</span>
          ${r.status === "requested" ? `<button class="req-cancel" type="button" data-cancel="${esc(r.id)}">Cancel</button>` : ""}
        </div>
      </article>`).join("");
  }

  $("#request-list").addEventListener("click", async e => {
    const btn = e.target.closest("[data-cancel]");
    if (!btn) return;
    btn.disabled = true;
    try {
      await rpc("guest_cancel_request", { p_code: code, p_id: btn.dataset.cancel });
      await refresh();
    } finally { btn.disabled = false; }
  });

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(text) {
    const t = $("#toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  /* ---------- Demo data (only while Supabase isn't connected) ---------- */
  const demoStore = { requests: [] };
  function demoRpc(name, args) {
    const valid = String(args.p_code || "").toUpperCase().replace(/[^A-Z0-9]/g, "") === "DEMO";
    if (!valid) return Promise.resolve({ error: "invalid_code" });
    const today = new Date();
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const plus = n => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };
    if (name === "guest_add_request") {
      demoStore.requests.unshift({ id: String(Date.now()), kind: args.p_kind, title: args.p_title, details: args.p_details, requested_for: args.p_requested_for, status: "requested", owner_note: null });
      return Promise.resolve({ id: demoStore.requests[0].id, status: "requested" });
    }
    if (name === "guest_cancel_request") {
      const r = demoStore.requests.find(x => x.id === args.p_id);
      if (r) r.status = "cancelled";
      return Promise.resolve({ cancelled: !!r });
    }
    const phase = new URLSearchParams(location.search).get("phase") || "stay";
    return Promise.resolve({
      booking: { code: "DEMO", guest_name: "Demo Guest", check_in: phase === "before" ? plus(5) : plus(-1), check_out: phase === "before" ? plus(12) : plus(6), adults: 6, children: 2 },
      phase,
      today: iso(today),
      settings: {
        checkin_time: { value: "Sample: 16:00" }, checkout_time: { value: "Sample: 11:00" },
        host_name: { value: "Sample host" }, emergency: { value: "112" },
        wifi_name: { value: "Sample-Network" }, wifi_password: { value: "sample-password" },
        gate_code: { value: "0000" }, door_code: { value: "0000" }
      },
      requests: demoStore.requests
    });
  }

  /* ---------- Start ---------- */
  const saved = store.get();
  if (saved) enter(saved, { silent: true });
})();
