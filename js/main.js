/* ==========================================================
   Costa Greca — site behaviour
   Edit CONFIG below with your real contact details and links.
   ========================================================== */

const CONFIG = {
  email: "reservations@costagreca.com", // TODO: your real booking email
  whatsapp: "",                         // TODO: international format, digits only, e.g. "306912345678"
  phoneDisplay: "",                     // TODO: e.g. "+30 691 234 5678"
  airbnbUrl: "#",                       // TODO: your Airbnb listing URL
  bookingUrl: "#",                      // TODO: your Booking.com listing URL
  maxGuests: 14,
  minNights: 3,                         // TODO: your minimum stay
  monthsAhead: 18,
  availabilityEndpoint: "/api/availability"
};

/* ---------- Header, nav, footer ---------- */
const header = document.querySelector(".site-header");
const mobileCta = document.querySelector(".mobile-cta");
const bookingSection = document.getElementById("booking");

function onScroll() {
  const y = window.scrollY;
  header.classList.toggle("scrolled", y > 60);
  const bookingTop = bookingSection.getBoundingClientRect().top;
  const footerVisible = document.querySelector(".site-footer").getBoundingClientRect().top < window.innerHeight;
  mobileCta.classList.toggle("show", y > window.innerHeight * 0.8 && bookingTop > window.innerHeight * 0.5 && !footerVisible);
}
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

const navToggle = document.querySelector(".nav-toggle");
navToggle.addEventListener("click", () => {
  const open = document.body.classList.toggle("nav-open");
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
});
document.querySelectorAll(".main-nav a").forEach(a => a.addEventListener("click", () => {
  document.body.classList.remove("nav-open");
  navToggle.setAttribute("aria-expanded", "false");
}));

document.getElementById("year").textContent = new Date().getFullYear();

const footerEmail = document.getElementById("footer-email");
footerEmail.textContent = CONFIG.email;
footerEmail.href = `mailto:${CONFIG.email}`;
const footerPhone = document.getElementById("footer-phone");
if (CONFIG.phoneDisplay) {
  footerPhone.textContent = CONFIG.phoneDisplay;
  footerPhone.href = `tel:${CONFIG.phoneDisplay.replace(/\s/g, "")}`;
} else {
  footerPhone.remove();
}
document.getElementById("airbnb-link").href = CONFIG.airbnbUrl;
document.getElementById("booking-link").href = CONFIG.bookingUrl;
if (!CONFIG.whatsapp) document.getElementById("wa-btn").remove();

/* ---------- Reveal on scroll ---------- */
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add("visible");
      revealObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
document.querySelectorAll(".reveal").forEach(el => revealObserver.observe(el));

/* ---------- Gallery lightbox ---------- */
const items = [...document.querySelectorAll(".g-item")];
const lightbox = document.getElementById("lightbox");
const lbImg = lightbox.querySelector("img");
let lbIndex = 0;

function showPhoto(i) {
  lbIndex = (i + items.length) % items.length;
  lbImg.src = items[lbIndex].dataset.full;
  lbImg.alt = items[lbIndex].querySelector("img").alt;
}
function openLightbox(i) {
  showPhoto(i);
  lightbox.hidden = false;
  document.body.style.overflow = "hidden";
  lightbox.querySelector(".lb-close").focus();
}
function closeLightbox() {
  lightbox.hidden = true;
  document.body.style.overflow = "";
  items[lbIndex].focus();
}
items.forEach((btn, i) => btn.addEventListener("click", () => openLightbox(i)));
lightbox.querySelector(".lb-close").addEventListener("click", closeLightbox);
lightbox.querySelector(".lb-prev").addEventListener("click", () => showPhoto(lbIndex - 1));
lightbox.querySelector(".lb-next").addEventListener("click", () => showPhoto(lbIndex + 1));
lightbox.addEventListener("click", e => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener("keydown", e => {
  if (lightbox.hidden) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") showPhoto(lbIndex - 1);
  if (e.key === "ArrowRight") showPhoto(lbIndex + 1);
});

/* ---------- Availability calendar ---------- */
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = fromIso(s); d.setDate(d.getDate() + n); return iso(d); };
const nightsBetween = (a, b) => Math.round((fromIso(b) - fromIso(a)) / 86400000);
const pretty = s => fromIso(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const calEl = document.getElementById("calendar");
const calTitles = document.querySelector(".cal-titles");
const prevBtn = document.querySelector('.cal-nav[data-dir="-1"]');
const nextBtn = document.querySelector('.cal-nav[data-dir="1"]');
const formError = document.getElementById("form-error");

const today = iso(new Date());
const firstMonth = new Date(); firstMonth.setDate(1);
let offset = 0;
let checkIn = null;
let checkOut = null;
const booked = new Set();

const monthsShown = () => (window.innerWidth < 640 ? 1 : 2);

function hasBookedNight(from, to) {
  for (let d = from; d < to; d = addDays(d, 1)) if (booked.has(d)) return true;
  return false;
}

function renderCalendar() {
  const n = monthsShown();
  calEl.style.setProperty("--months", n);
  calTitles.style.setProperty("--months", n);
  calEl.innerHTML = "";
  calTitles.innerHTML = "";

  for (let m = 0; m < n; m++) {
    const month = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + offset + m, 1);
    const title = document.createElement("span");
    title.textContent = month.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    calTitles.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "cal-grid";
    ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].forEach(d => {
      const el = document.createElement("div");
      el.className = "cal-dow";
      el.textContent = d;
      grid.appendChild(el);
    });
    const lead = (month.getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) grid.appendChild(document.createElement("span"));

    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const d = iso(new Date(month.getFullYear(), month.getMonth(), day));
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal-day";
      btn.textContent = day;
      btn.dataset.date = d;

      const isPast = d < today;
      const isBooked = booked.has(d);
      // A booked day can still be a check-out day (the next guest arrives that afternoon).
      const validCheckout = checkIn && !checkOut && d > checkIn && !hasBookedNight(checkIn, d);
      if (isPast) btn.classList.add("past");
      if (isBooked) btn.classList.add("booked");
      if (d === today) btn.classList.add("today");
      btn.disabled = isPast || (isBooked && !validCheckout);

      if (d === checkIn) btn.classList.add("start");
      if (d === checkOut) btn.classList.add("end");
      if (checkIn && checkOut && d > checkIn && d < checkOut) btn.classList.add("in-range");
      btn.setAttribute("aria-label", pretty(d) + (isBooked ? " (booked)" : ""));
      btn.setAttribute("aria-pressed", String(d === checkIn || d === checkOut));
      grid.appendChild(btn);
    }
    calEl.appendChild(grid);
  }

  prevBtn.disabled = offset <= 0;
  nextBtn.disabled = offset + n >= CONFIG.monthsAhead;
}

function updateSummary() {
  document.getElementById("sum-in").textContent = checkIn ? pretty(checkIn) : "Select date";
  document.getElementById("sum-out").textContent = checkOut ? pretty(checkOut) : "Select date";
  document.getElementById("sum-nights").textContent = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : "–";
}

calEl.addEventListener("click", e => {
  const btn = e.target.closest(".cal-day");
  if (!btn || btn.disabled) return;
  const d = btn.dataset.date;
  formError.textContent = "";

  if (!checkIn || checkOut || d <= checkIn) {
    checkIn = d;
    checkOut = null;
  } else if (nightsBetween(checkIn, d) < CONFIG.minNights) {
    formError.textContent = `The minimum stay is ${CONFIG.minNights} nights.`;
  } else {
    checkOut = d;
  }
  renderCalendar();
  updateSummary();
});

prevBtn.addEventListener("click", () => { offset = Math.max(0, offset - 1); renderCalendar(); });
nextBtn.addEventListener("click", () => { offset += 1; renderCalendar(); });

let lastMonths = monthsShown();
window.addEventListener("resize", () => {
  if (monthsShown() !== lastMonths) { lastMonths = monthsShown(); renderCalendar(); }
});

renderCalendar();
updateSummary();

// Load booked dates synced from Airbnb / Booking.com (see api/availability.js).
fetch(CONFIG.availabilityEndpoint)
  .then(r => (r.ok ? r.json() : { booked: [] }))
  .then(data => {
    (data.booked || []).forEach(({ start, end }) => {
      for (let d = start; d < end; d = addDays(d, 1)) booked.add(d);
    });
    if (checkIn && (booked.has(checkIn) || (checkOut && hasBookedNight(checkIn, checkOut)))) {
      checkIn = checkOut = null;
      updateSummary();
    }
    renderCalendar();
  })
  .catch(() => { /* no sync configured: every future date shows as available */ });

/* ---------- Guests ---------- */
const adultsSel = document.getElementById("adults");
const childrenSel = document.getElementById("children");
for (let i = 1; i <= CONFIG.maxGuests; i++) adultsSel.add(new Option(i, i, i === 2, i === 2));
for (let i = 0; i < CONFIG.maxGuests; i++) childrenSel.add(new Option(i, i));

/* ---------- Enquiry ---------- */
const form = document.getElementById("enquiry");
form.addEventListener("submit", e => {
  e.preventDefault();
  const channel = e.submitter?.dataset.channel || "email";
  const data = new FormData(form);
  const adults = Number(data.get("adults"));
  const children = Number(data.get("children"));
  const name = data.get("name").trim();
  const email = data.get("email").trim();

  if (!checkIn || !checkOut) return (formError.textContent = "Please select your check-in and check-out dates on the calendar.");
  if (adults + children > CONFIG.maxGuests) return (formError.textContent = `Costa Greca welcomes up to ${CONFIG.maxGuests} guests.`);
  if (!name) return (formError.textContent = "Please enter your name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) return (formError.textContent = "Please enter a valid email address.");
  formError.textContent = "";

  const nights = nightsBetween(checkIn, checkOut);
  const lines = [
    "Booking enquiry: Costa Greca",
    "",
    `Dates: ${pretty(checkIn)} to ${pretty(checkOut)} (${nights} nights)`,
    `Guests: ${adults} adult${adults > 1 ? "s" : ""}${children ? `, ${children} child${children > 1 ? "ren" : ""}` : ""}`,
    `Name: ${name}`,
    `Email: ${email}`
  ];
  const phone = data.get("phone").trim();
  if (phone) lines.push(`Phone: ${phone}`);
  const message = data.get("message").trim();
  if (message) lines.push("", message);
  const body = lines.join("\n");

  if (channel === "whatsapp" && CONFIG.whatsapp) {
    window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(body)}`, "_blank", "noopener");
  } else {
    const subject = `Costa Greca enquiry: ${pretty(checkIn)} to ${pretty(checkOut)}`;
    window.location.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
});
