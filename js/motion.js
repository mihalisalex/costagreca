/* ==========================================================
   Costa Greca — cinematic layer
   Intro, smooth scrolling, scroll-driven scenes, reveals, cursor.
   Runs only when <html> has the "motion" class (visitor has not
   asked for reduced motion) and GSAP has loaded.
   ========================================================== */

(() => {
  const root = document.documentElement;

  /* ---------- Live time & weather in Crete (always on) ---------- */
  const timeEl = document.getElementById("meta-time");
  const weatherEl = document.getElementById("meta-weather");
  const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Athens" });
  const tick = () => { timeEl.textContent = `${clock.format(new Date())} in Crete`; };
  tick();
  setInterval(tick, 30000);
  fetch("https://api.open-meteo.com/v1/forecast?latitude=35.33&longitude=25.19&current=temperature_2m&daily=sunset&timezone=Europe%2FAthens&forecast_days=1")
    .then(r => r.json())
    .then(d => {
      const temp = Math.round(d.current.temperature_2m);
      const sunset = d.daily.sunset[0].slice(11, 16);
      weatherEl.textContent = `${temp}°C · Sunset ${sunset}`;
    })
    .catch(() => {});

  if (!root.classList.contains("motion")) return;
  if (!window.gsap || !window.ScrollTrigger) {
    root.classList.remove("motion");
    return;
  }
  gsap.registerPlugin(ScrollTrigger);
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---------- Smooth scrolling ---------- */
  let lenis = null;
  if (window.Lenis) {
    lenis = new Lenis({ duration: 1.2, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
    window.lenis = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(time => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    document.addEventListener("click", e => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;
      const hash = link.getAttribute("href");
      const target = hash === "#top" ? 0 : document.querySelector(hash);
      if (target === null) return;
      e.preventDefault();
      lenis.scrollTo(target, { duration: 1.6 });
    });
  }

  /* ---------- Helpers ---------- */
  // Wrap every word in a masked span, keeping <em> and <br> intact.
  function splitWords(el) {
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) return frag.appendChild(document.createTextNode(part));
            const outer = document.createElement("span");
            const inner = document.createElement("span");
            outer.className = "sw";
            inner.textContent = part;
            outer.appendChild(inner);
            frag.appendChild(outer);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === Node.ELEMENT_NODE && n.tagName !== "BR") {
          walk(n);
        }
      });
    };
    walk(el);
    return el.querySelectorAll(".sw > span");
  }

  /* ---------- Hero entrance ---------- */
  const title = document.querySelector(".hero-title");
  title.innerHTML = title.textContent.trim().split(/\s+/)
    .map(word => `<span class="wd" aria-hidden="true">${[...word].map(c => `<span class="ch">${c}</span>`).join("")}</span>`)
    .join(" ");

  const show = { opacity: 1, y: 0, duration: 1.1, ease: "power3.out" };
  const heroIn = gsap.timeline({ paused: true })
    .fromTo(".hero-media", { scale: 1.18 }, { scale: 1, duration: 3.4, ease: "power2.out" }, 0)
    .fromTo(".hero-content .eyebrow", { opacity: 0, y: 20 }, show, 0.25)
    .set(title, { opacity: 1 }, 0.4)
    .fromTo(".hero-title .ch", { yPercent: 115 }, { yPercent: 0, duration: 1.3, stagger: 0.045, ease: "expo.out" }, 0.4)
    .fromTo([".hero-sub", ".hero-content .meander", ".hero-lede", ".hero-actions"], { opacity: 0, y: 24 }, { ...show, stagger: 0.12 }, 0.95)
    .fromTo([".hero-meta", ".scroll-cue"], { opacity: 0 }, { opacity: 1, duration: 1.2 }, 1.5);

  /* ---------- Intro (once per visit) ---------- */
  if (!root.classList.contains("intro-seen")) {
    try { sessionStorage.setItem("cg-intro", "1"); } catch (e) {}
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    lenis?.stop();
    gsap.timeline({
      delay: 0.2,
      onComplete() {
        document.querySelector(".preloader")?.remove();
        lenis?.start();
      }
    })
      .to(".pl-frame", { strokeDashoffset: 0, duration: 1.4, ease: "power2.inOut" })
      .to(".pl-cg", { opacity: 1, duration: 0.9 }, "-=0.6")
      .fromTo(".pl-name", { opacity: 0, letterSpacing: "0.2em" }, { opacity: 1, letterSpacing: "0.5em", duration: 1.3, ease: "power2.out" }, "-=0.6")
      .to(".pl-mark", { opacity: 0, y: -16, duration: 0.6, ease: "power2.in" }, "+=0.3")
      .to(".pl-top", { yPercent: -100, duration: 1.3, ease: "expo.inOut" }, "-=0.1")
      .to(".pl-bottom", { yPercent: 100, duration: 1.3, ease: "expo.inOut" }, "<")
      .add(() => heroIn.play(), "<0.3");
  } else {
    document.querySelector(".preloader")?.remove();
    heroIn.play();
  }

  /* ---------- Hero: golden hour fades to twilight as you scroll ----------
     Both photos share the same framing, so they move together and only the light changes. */
  gsap.timeline({
    scrollTrigger: { trigger: ".hero", start: "top top", end: "+=100%", scrub: true, pin: true }
  })
    .to(".hero-content", { yPercent: -20, opacity: 0, ease: "none", duration: 0.35 }, 0)
    .to(".hero-day", { opacity: 0, ease: "none", duration: 0.65 }, 0.15)
    .fromTo(".hero-img", { scale: 1 }, { scale: 1.08, ease: "none", duration: 1 }, 0)
    .to(".hero-shade", { opacity: 0.55, ease: "none", duration: 1 }, 0);

  /* ---------- Facts count up ---------- */
  document.querySelectorAll("[data-count]").forEach(el => {
    const end = Number(el.dataset.count);
    const counter = { v: 0 };
    gsap.to(counter, {
      v: end, duration: 1.6, ease: "power2.out",
      onUpdate: () => { el.textContent = Math.round(counter.v); },
      scrollTrigger: { trigger: el, start: "top 90%" }
    });
  });

  /* ---------- Headings: words rise from behind a mask ---------- */
  document.querySelectorAll("[data-split]").forEach(el => {
    gsap.from(splitWords(el), {
      yPercent: 115, duration: 1.2, ease: "expo.out", stagger: 0.05,
      scrollTrigger: { trigger: el, start: "top 88%" }
    });
  });

  /* ---------- Images: curtain wipe + parallax ---------- */
  document.querySelectorAll("[data-clip]").forEach(frame => {
    const img = frame.querySelector("img");
    gsap.timeline({ scrollTrigger: { trigger: frame, start: "top 85%" } })
      .to(frame, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.6, ease: "expo.inOut" })
      .from(img, { scale: 1.3, duration: 2, ease: "expo.out" }, 0.1);
  });
  document.querySelectorAll("[data-parallax]").forEach(img => {
    gsap.fromTo(img, { yPercent: -6 }, {
      yPercent: 6, ease: "none",
      scrollTrigger: { trigger: img.parentElement, start: "top bottom", end: "bottom top", scrub: true }
    });
  });
  gsap.utils.toArray(".exp-card img").forEach(img => {
    gsap.fromTo(img, { clipPath: "inset(0% 0% 100% 0%)" }, {
      clipPath: "inset(0% 0% 0% 0%)", duration: 1.5, ease: "expo.inOut",
      scrollTrigger: { trigger: img, start: "top 88%" }
    });
  });

  /* ---------- Gallery tiles arrive in sequence ---------- */
  gsap.set(".g-item", { opacity: 0, y: 60 });
  ScrollTrigger.batch(".g-item", {
    start: "top 92%",
    onEnter: batch => gsap.to(batch, { opacity: 1, y: 0, duration: 1.2, ease: "expo.out", stagger: 0.08 })
  });

  /* ---------- Estate tour: pinned aerial that zooms to each feature ---------- */
  const canvas = document.querySelector(".estate-canvas");
  const points = gsap.utils.toArray(".estate-points li");
  const progressBar = document.querySelector(".estate-progress span");
  // Centre the aerial with GSAP so its x/y offsets below compose cleanly.
  gsap.set(canvas, { x: 0, y: 0, xPercent: -50, yPercent: -50 });
  const focus = li => {
    const s = Number(li.dataset.s);
    return {
      scale: s,
      x: () => -(Number(li.dataset.x) - 0.5) * canvas.offsetWidth * s,
      y: () => -(Number(li.dataset.y) - 0.5) * canvas.offsetHeight * s
    };
  };
  const tour = gsap.timeline({
    defaults: { ease: "power2.inOut" },
    scrollTrigger: {
      trigger: ".estate",
      start: "top top",
      end: () => "+=" + window.innerHeight * (points.length + 1.5),
      pin: true,
      scrub: 1,
      invalidateOnRefresh: true,
      onUpdate: self => gsap.set(progressBar, { scaleY: self.progress })
    }
  })
    .fromTo(canvas, { scale: 1.12 }, { scale: 1, duration: 1 })
    .to(".estate-head", { opacity: 0, y: -30, duration: 0.6 }, "+=0.2");

  points.forEach(li => {
    tour
      .to(canvas, { ...focus(li), duration: 1.4 }, ">-0.2")
      .fromTo(".estate-ring", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5 }, "-=0.4")
      .fromTo(li, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6 }, "<")
      .to({}, { duration: 0.8 })
      .to(li, { opacity: 0, y: -30, duration: 0.5 })
      .to(".estate-ring", { opacity: 0, duration: 0.3 }, "<");
  });
  tour.to(canvas, { x: 0, y: 0, scale: 1, duration: 1.4 }, ">-0.2");

  /* ---------- Suites: vertical scroll drives a horizontal film strip ---------- */
  gsap.matchMedia().add("(min-width: 901px)", () => {
    const track = document.querySelector(".suites-track");
    const current = document.querySelector(".sc-current");
    const total = track.querySelectorAll(".suite").length;
    const distance = () => track.scrollWidth - window.innerWidth;
    const strip = gsap.to(track, {
      x: () => -distance(),
      ease: "none",
      scrollTrigger: {
        trigger: ".suites-pin",
        start: "top top",
        end: () => "+=" + distance(),
        pin: true,
        scrub: 1,
        invalidateOnRefresh: true,
        onUpdate: self => {
          current.textContent = String(Math.min(total, Math.floor(self.progress * total) + 1)).padStart(2, "0");
        }
      }
    });
    track.querySelectorAll(".suite-media img").forEach(img => {
      gsap.fromTo(img, { xPercent: -5, scale: 1.12 }, {
        xPercent: 5, ease: "none",
        scrollTrigger: { trigger: img.parentElement, containerAnimation: strip, start: "left right", end: "right left", scrub: true }
      });
    });
  });

  /* ---------- Custom cursor & magnetic buttons ---------- */
  if (finePointer) {
    root.classList.add("has-cursor");
    const cursor = document.querySelector(".cursor");
    const dot = cursor.querySelector(".cursor-dot");
    const ring = cursor.querySelector(".cursor-ring");
    const label = cursor.querySelector(".cursor-label");
    const dotX = gsap.quickTo(dot, "x", { duration: 0.12 });
    const dotY = gsap.quickTo(dot, "y", { duration: 0.12 });
    const ringX = gsap.quickTo(ring, "x", { duration: 0.55, ease: "power3" });
    const ringY = gsap.quickTo(ring, "y", { duration: 0.55, ease: "power3" });
    cursor.classList.add("is-hidden");

    window.addEventListener("mousemove", e => {
      cursor.classList.remove("is-hidden");
      dotX(e.clientX); dotY(e.clientY);
      ringX(e.clientX); ringY(e.clientY);
    });
    document.addEventListener("mouseleave", () => cursor.classList.add("is-hidden"));
    document.addEventListener("mouseover", e => {
      const target = e.target.closest("[data-cursor], a, button, label, select");
      const text = target?.dataset.cursor || "";
      cursor.classList.toggle("is-label", !!text);
      cursor.classList.toggle("is-link", !!target && !text);
      label.textContent = text;
    });

    document.querySelectorAll("[data-magnetic]").forEach(el => {
      const x = gsap.quickTo(el, "x", { duration: 0.8, ease: "elastic.out(1, 0.4)" });
      const y = gsap.quickTo(el, "y", { duration: 0.8, ease: "elastic.out(1, 0.4)" });
      el.addEventListener("mousemove", e => {
        const r = el.getBoundingClientRect();
        x((e.clientX - r.left - r.width / 2) * 0.3);
        y((e.clientY - r.top - r.height / 2) * 0.4);
      });
      el.addEventListener("mouseleave", () => { x(0); y(0); });
    });
  }

  /* ---------- Keep scroll positions right once images and fonts settle ---------- */
  ScrollTrigger.sort();
  window.addEventListener("load", () => ScrollTrigger.refresh());
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
})();
