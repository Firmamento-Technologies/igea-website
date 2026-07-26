/* ═══════════════════════════════════════════════════════════════
   SEGRETARIA AI — motore cinetico
   Moduli: Lenis smooth scroll, cursor, reveal, chat wall live,
   coda animata, scroll orizzontale, circuito 118, waveform, KPI,
   form lead. Degrada elegantemente senza gsap / con reduced-motion.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  var hasGsap = typeof window.gsap !== 'undefined';
  var ANIM = !reducedMotion && hasGsap;

  if (hasGsap) {
    gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);
  } else {
    document.documentElement.classList.add('no-motion');
  }

  var sleep = function (ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  };

  /* ────────────────────────────────────────────────
     1. Lenis smooth scroll + integrazione ScrollTrigger
     ──────────────────────────────────────────────── */
  // Diagnostica: ?lenis=off disattiva lo smooth-scroll (scroll nativo) per
  // isolare la causa di eventuali saltelli — tutto il resto resta attivo.
  var LENIS_OFF = /[?&]lenis=off/.test(location.search);
  var lenis = null;
  if (ANIM && !LENIS_OFF && typeof window.Lenis !== 'undefined') {
    // lerp 0.14 (era 0.1): coda di easing più corta → quando fermi lo scroll
    // la pagina si ferma SUBITO invece di "galleggiare" ancora un istante.
    lenis = new Lenis({ lerp: 0.14, wheelMultiplier: 1.05 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  // Anchor links compatibili con Lenis
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      if (lenis) {
        lenis.scrollTo(target, { offset: -70, duration: 1.4 });
      } else {
        target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
      }
    });
  });

  /* ────────────────────────────────────────────────
     2. Nav allo scroll
     ──────────────────────────────────────────────── */
  var nav = document.getElementById('nav');
  var onScrollNav = function () {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  };
  window.addEventListener('scroll', onScrollNav, { passive: true });
  onScrollNav();

  /* ────────────────────────────────────────────────
     3. Custom cursor + bottoni magnetici (solo desktop)
     ──────────────────────────────────────────────── */
  if (!isTouch && ANIM) {
    var dot = document.querySelector('.cursor-dot');
    var ring = document.querySelector('.cursor-ring');
    var rx = gsap.quickTo(ring, 'x', { duration: 0.35, ease: 'power3.out' });
    var ry = gsap.quickTo(ring, 'y', { duration: 0.35, ease: 'power3.out' });
    window.addEventListener('mousemove', function (e) {
      gsap.set(dot, { x: e.clientX, y: e.clientY });
      rx(e.clientX); ry(e.clientY);
    });
    document.querySelectorAll('a, button, summary').forEach(function (el) {
      el.addEventListener('mouseenter', function () { document.body.classList.add('cursor-hover'); });
      el.addEventListener('mouseleave', function () { document.body.classList.remove('cursor-hover'); });
    });

    // Magnetismo
    document.querySelectorAll('[data-magnetic]').forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        gsap.to(el, {
          x: (e.clientX - r.left - r.width / 2) * 0.25,
          y: (e.clientY - r.top - r.height / 2) * 0.25,
          duration: 0.3,
        });
      });
      el.addEventListener('mouseleave', function () {
        gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.4)' });
      });
    });
  }

  /* ────────────────────────────────────────────────
     4. Reveal generici + titoli splittati
     ──────────────────────────────────────────────── */
  if (ANIM) {
    // Hero title: maschera per linea
    document.querySelectorAll('.hero-title .line').forEach(function (line) {
      line.innerHTML = '<span class="line-inner" style="display:inline-block">' + line.innerHTML + '</span>';
    });
    gsap.from('.hero-title .line-inner', {
      yPercent: 115,
      rotate: 2,
      duration: 1.1,
      ease: 'power4.out',
      stagger: 0.12,
      delay: 0.15,
    });

    // data-reveal
    document.querySelectorAll('[data-reveal]').forEach(function (el) {
      gsap.to(el, {
        opacity: 1, y: 0,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        onComplete: function () { el.classList.add('revealed'); },
      });
    });

    // data-split: reveal parola per parola
    document.querySelectorAll('[data-split]').forEach(function (title) {
      var words = title.innerHTML.split(/(<em>.*?<\/em>)/g).map(function (chunk) {
        if (chunk.indexOf('<em>') === 0) return chunk;
        return chunk.split(' ').filter(Boolean).map(function (w) {
          return '<span class="sw" style="display:inline-block;overflow:hidden;vertical-align:bottom">' +
                 '<span class="sw-i" style="display:inline-block">' + w + '</span></span> ';
        }).join('');
      }).join(' ');
      title.innerHTML = words;
      gsap.from(title.querySelectorAll('.sw-i, em'), {
        yPercent: 110,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.045,
        scrollTrigger: { trigger: title, start: 'top 85%', once: true },
      });
    });
  }

  /* ────────────────────────────────────────────────
     5. IL MURO DELLE CONVERSAZIONI (hero)
     ──────────────────────────────────────────────── */
  var SCRIPTS = [
    { name: 'Marta R.', tag: 'Prenotazione', msgs: [
      ['p', 'Buongiorno, c\u2019è posto per una visita questa settimana?'],
      ['a', 'Buongiorno! Giovedì 10:30 o venerdì 16:00. Quale preferisce?'],
      ['p', 'Giovedì, grazie'],
      ['a', 'Prenotata per giovedì alle 10:30. Promemoria il giorno prima ✓'],
    ], done: 'Prenotata ✓' },
    { name: 'Giuseppe B.', tag: 'Spostamento', msgs: [
      ['p', 'Devo spostare la visita di domani, mi dispiace'],
      ['a', 'Nessun problema: martedì 9:00 o mercoledì 12:30?'],
      ['p', 'Martedì va bene'],
      ['a', 'Fatto, visita spostata a martedì alle 9:00 ✓'],
    ], done: 'Spostata ✓' },
    { name: 'Anna F.', tag: 'Ricetta', msgs: [
      ['p', 'Mi serve il rinnovo della ricetta per la pressione'],
      ['a', 'Ho preparato la bozza di richiesta: il medico la revisiona e firma. Le scriviamo appena è pronta ✓'],
    ], done: 'Bozza al medico ✓' },
    { name: 'Luigi T.', tag: 'Orari', msgs: [
      ['p', 'A che ora chiudete oggi?'],
      ['a', 'Oggi chiudiamo alle 19:00. Domani 9:00–13:00 e 15:00–19:00.'],
    ], done: 'Risposta data ✓' },
    { name: 'Sara M.', tag: 'Farmacia', msgs: [
      ['p', 'Quale farmacia è di turno domenica?'],
      ['a', 'Domenica è di turno la Farmacia San Martino, Via Roma 14.'],
    ], done: 'Risposta data ✓' },
    { name: 'Paolo G.', tag: 'Disdetta', msgs: [
      ['p', 'Devo annullare l\u2019appuntamento di venerdì'],
      ['a', 'Fatto, ho annullato e liberato il posto. Vuole riprogrammare?'],
      ['p', 'No grazie'],
      ['a', 'Va bene, restiamo a disposizione!'],
    ], done: 'Annullata ✓' },
    { name: 'Elena V.', tag: 'Preparazione', msgs: [
      ['p', 'Per l\u2019ecografia devo essere a digiuno?'],
      ['a', 'Sì: digiuno da 6 ore, acqua naturale permessa. Le mando il promemoria il giorno prima ✓'],
    ], done: 'Risposta data ✓' },
    { name: 'Marco D.', tag: 'Certificato', msgs: [
      ['p', 'Posso avere il certificato per la palestra?'],
      ['a', 'Serve una visita in studio: ho posto giovedì alle 11:15, va bene?'],
      ['p', 'Perfetto'],
      ['a', 'Prenotata ✓ Porti un documento.'],
    ], done: 'Prenotata ✓' },
    { name: 'Chiara S.', tag: 'Prima visita', msgs: [
      ['p', 'Vorrei prenotare una prima visita'],
      ['a', 'Benvenuta! Dura 30 minuti: lunedì 17:00 o martedì 10:00?'],
      ['p', 'Martedì'],
      ['a', 'Prenotata per martedì alle 10:00 ✓'],
    ], done: 'Prenotata ✓' },
    { name: 'Franco P.', tag: 'Handoff', msgs: [
      ['p', 'Vorrei parlare direttamente col dottore'],
      ['a', 'Certo, giro la richiesta allo studio: la ricontattiamo appena possibile ✓'],
    ], done: 'Passata allo studio ✓' },
    { name: 'Lucia A.', tag: 'Parcheggio', msgs: [
      ['p', 'C\u2019è parcheggio vicino allo studio?'],
      ['a', 'Sì: Piazza Vittoria a 200 m, e il bus 12 ferma davanti all\u2019ingresso.'],
    ], done: 'Risposta data ✓' },
    { name: 'Andrea C.', tag: 'Costi', msgs: [
      ['p', 'Quanto costa una visita di controllo?'],
      ['a', '€80. La prima visita €120. Vuole che fissi un appuntamento?'],
      ['p', 'Sì, la prossima settimana'],
      ['a', 'Ho lunedì 9:30 o mercoledì 15:30. Quale preferisce?'],
    ], done: 'In prenotazione…' },
    { name: 'Rosa N.', tag: 'Bambini', msgs: [
      ['p', 'Visitate anche i bambini?'],
      ['a', 'Sì, dai 3 anni. Per i più piccoli consigliamo il mattino: mercoledì 9:30 è libero.'],
    ], done: 'Risposta data ✓' },
    { name: 'Nadia P.', tag: 'Impegnativa', msgs: [
      ['p', 'Mi serve l\u2019impegnativa per la risonanza magnetica'],
      ['a', 'Registro la richiesta e la sottopongo al medico: appena pronta, le scriviamo per il ritiro ✓'],
    ], done: 'Registrata ✓' },
    { name: 'Davide L.', tag: 'Promemoria', msgs: [
      ['p', 'Che giorno era la mia visita?'],
      ['a', 'Giovedì alle 16:00. Le arriva un promemoria il giorno prima ✓'],
    ], done: 'Risposta data ✓' },
  ];

  var counter = 0;
  var counterEl = document.getElementById('hero-counter');
  function bumpCounter() {
    counter += 1;
    if (!counterEl) return;
    if (ANIM) {
      gsap.fromTo(counterEl, { scale: 1.35 }, {
        scale: 1, duration: 0.5, ease: 'power2.out',
      });
    }
    counterEl.textContent = counter;
  }

  // Categoria triage del tag → classe CSS (colori da priorità clinica)
  var TAG_CLASS = {
    'Prenotazione': 'tag-agenda', 'Spostamento': 'tag-agenda', 'Disdetta': 'tag-agenda',
    'Certificato': 'tag-agenda', 'Prima visita': 'tag-agenda', 'Promemoria': 'tag-agenda',
    'Ricetta': 'tag-ricetta', 'Impegnativa': 'tag-ricetta',
    'Handoff': 'tag-handoff',
  };
  function tagClass(tag) { return TAG_CLASS[tag] || 'tag-info'; }

  function typeMessage(bubble, text, speed) {
    return new Promise(function (resolve) {
      var i = 0;
      bubble.classList.add('msg-caret');
      var iv = setInterval(function () {
        i += 1;
        bubble.textContent = text.slice(0, i);
        if (i >= text.length) {
          clearInterval(iv);
          bubble.classList.remove('msg-caret');
          resolve();
        }
      }, speed);
    });
  }

  function runChatCard(card, scriptIndex) {
    var body = card.querySelector('.chat-body');
    var statusEl = card.querySelector('.chat-status');
    var nameEl = card.querySelector('.chat-name');
    var avatarEl = card.querySelector('.chat-avatar');

    (async function loop() {
      var idx = scriptIndex;
      /* eslint-disable no-constant-condition */
      while (true) {
        var script = SCRIPTS[idx % SCRIPTS.length];
        idx += 3; // varietà: ogni ciclo salta ad altri script
        nameEl.textContent = script.name;
        avatarEl.textContent = script.name.charAt(0);
        card.classList.remove('resolved', 'tag-agenda', 'tag-ricetta', 'tag-info', 'tag-handoff');
        card.classList.add(tagClass(script.tag));
        statusEl.textContent = script.tag;
        body.innerHTML = '';
        await sleep(600 + Math.random() * 900);

        for (var m = 0; m < script.msgs.length; m++) {
          var who = script.msgs[m][0];
          var text = script.msgs[m][1];
          if (who === 'a') {
            var dots = document.createElement('div');
            dots.className = 'typing-dots';
            dots.innerHTML = '<i></i><i></i><i></i>';
            body.appendChild(dots);
            await sleep(650 + Math.random() * 500);
            dots.remove();
          }
          var bubble = document.createElement('div');
          bubble.className = 'msg ' + (who === 'p' ? 'msg-patient' : 'msg-ai');
          body.appendChild(bubble);
          await typeMessage(bubble, text, who === 'p' ? 26 : 13);
          await sleep(350 + Math.random() * 350);
        }

        card.classList.add('resolved');
        statusEl.textContent = script.done;
        bumpCounter();
        await sleep(3800 + Math.random() * 2200);
      }
    })();
  }

  function staticChatCard(card, scriptIndex) {
    // Reduced motion / no-gsap: mostra la conversazione finale, senza typing
    var script = SCRIPTS[scriptIndex % SCRIPTS.length];
    var body = card.querySelector('.chat-body');
    card.classList.add(tagClass(script.tag));
    card.querySelector('.chat-name').textContent = script.name;
    card.querySelector('.chat-avatar').textContent = script.name.charAt(0);
    card.querySelector('.chat-status').textContent = script.done;
    card.classList.add('resolved');
    body.innerHTML = '';
    script.msgs.slice(0, 3).forEach(function (m) {
      var b = document.createElement('div');
      b.className = 'msg ' + (m[0] === 'p' ? 'msg-patient' : 'msg-ai');
      b.textContent = m[1];
      body.appendChild(b);
    });
  }

  (function buildWall() {
    var grid = document.getElementById('wall-grid');
    if (!grid) return;
    var w = window.innerWidth;
    var count = w < 640 ? 4 : w < 1000 ? 6 : 12;
    for (var i = 0; i < count; i++) {
      var card = document.createElement('div');
      card.className = 'chat-card';
      card.innerHTML =
        '<div class="chat-head">' +
        '<span class="chat-avatar"></span>' +
        '<span class="chat-name"></span>' +
        '<span class="chat-status"></span>' +
        '</div><div class="chat-body"></div>';
      grid.appendChild(card);
      if (ANIM) {
        gsap.from(card, {
          opacity: 0, y: 24, scale: 0.96,
          duration: 0.7, delay: 0.5 + i * 0.09, ease: 'power3.out',
        });
        // Avvio sfalsato: ogni scheda inizia da uno script e un momento diverso
        (function (c, s, d) {
          setTimeout(function () { runChatCard(c, s); }, d);
        })(card, i, 900 + i * 700);
      } else {
        staticChatCard(card, i);
      }
    }
  })();

  /* ────────────────────────────────────────────────
     6. LA CODA (problema) — pazienti che riattaccano
     ──────────────────────────────────────────────── */
  (function buildQueue() {
    var row = document.getElementById('queue-row');
    var countEl = document.getElementById('queue-count');
    if (!row) return;
    var N = 7;
    var persons = [];
    for (var i = 0; i < N; i++) {
      var p = document.createElement('div');
      p.className = 'queue-person';
      p.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg>';
      row.appendChild(p);
      persons.push(p);
    }
    if (!ANIM) return;

    var waiting = N;
    function dropOne() {
      var candidates = persons.filter(function (p) { return !p.classList.contains('lost'); });
      if (candidates.length === 0) {
        // reset: tutti tornano in coda
        persons.forEach(function (p, k) {
          p.classList.remove('lost');
          gsap.fromTo(p, { opacity: 0, y: -14 }, { opacity: 1, y: 0, duration: 0.4, delay: k * 0.07 });
        });
        waiting = N;
        countEl.textContent = waiting;
        setTimeout(dropOne, 2600);
        return;
      }
      var p = candidates[Math.floor(Math.random() * candidates.length)];
      p.classList.add('lost');
      gsap.to(p, {
        y: 26, rotate: 14, opacity: 0.45, duration: 0.7, ease: 'power2.in',
        onComplete: function () { gsap.set(p, { y: 0, rotate: 0, opacity: 1 }); },
      });
      waiting -= 1;
      countEl.textContent = waiting;
      setTimeout(dropOne, 1500 + Math.random() * 1400);
    }
    ScrollTrigger.create({
      trigger: row, start: 'top 85%', once: true,
      onEnter: function () { setTimeout(dropOne, 1200); },
    });
  })();

  /* ────────────────────────────────────────────────
     7. FUNZIONI — scroll orizzontale pinnato (desktop)
     ──────────────────────────────────────────────── */
  if (ANIM) {
    var mm = gsap.matchMedia();
    mm.add('(min-width: 768px)', function () {
      var track = document.getElementById('funzioni-track');
      var pin = document.getElementById('funzioni-pin');
      if (!track || !pin) return;
      var getAmount = function () { return Math.max(0, track.scrollWidth - window.innerWidth + 80); };
      gsap.to(track, {
        x: function () { return -getAmount(); },
        ease: 'none',
        scrollTrigger: {
          trigger: pin,
          start: 'top top',
          end: function () { return '+=' + (getAmount() + window.innerHeight * 0.4); },
          pin: true,
          // anticipatePin: compensa l'inserimento dello spazio-pin un frame PRIMA
          // → niente "salto" entrando nella sezione orizzontale.
          anticipatePin: 1,
          // scrub: true — NESSUN inseguimento ritardato: con scrub numerico
          // l'animazione continuava a muoversi ~0.5-1s DOPO lo stop dello
          // scroll (il "doppio saltello" segnalato). true = aggancio diretto.
          scrub: true,
          invalidateOnRefresh: true,
        },
      });
    });
  }

  /* ────────────────────────────────────────────────
     8. IL CANCELLO 118 — circuito animato
     ──────────────────────────────────────────────── */
  (function circuit() {
    var dotN = document.getElementById('dot-normal');
    var dotE = document.getElementById('dot-emergency');
    var pIn = document.getElementById('path-in');
    var pSafe = document.getElementById('path-safe');
    var pAlert = document.getElementById('path-alert');
    if (!dotN || !pIn) return;

    if (!ANIM) {
      dotN.style.display = 'none';
      dotE.style.display = 'none';
      return;
    }

    function makeLoop(dot, paths, color) {
      var tl = gsap.timeline({ repeat: -1, repeatDelay: 1.6 });
      paths.forEach(function (path) {
        tl.to(dot, {
          motionPath: { path: path, align: path, alignOrigin: [0.5, 0.5] },
          duration: path.getTotalLength() / 260,
          ease: 'power1.inOut',
        });
      });
      tl.to(dot, { scale: 1.8, duration: 0.25 }, '>-0.1');
      tl.to(dot, { scale: 1, duration: 0.3 });
      tl.set(dot, { motionPath: { path: paths[0], align: paths[0], alignOrigin: [0.5, 0.5], start: 0, end: 0 } });
      return tl;
    }

    ScrollTrigger.create({
      trigger: '.circuit-wrap', start: 'top 75%', once: true,
      onEnter: function () {
        makeLoop(dotN, [pIn, pSafe], '#0b52e0');
        gsap.delayedCall(2.2, function () { makeLoop(dotE, [pIn, pAlert], '#e5484d'); });
      },
    });
  })();

  /* ────────────────────────────────────────────────
     8b. Divisori ECG — la linea si disegna allo scroll
     ──────────────────────────────────────────────── */
  document.querySelectorAll('.ecg-line').forEach(function (path) {
    var len = path.getTotalLength();
    if (!ANIM) {
      path.style.strokeDasharray = 'none';
      return;
    }
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    gsap.to(path, {
      strokeDashoffset: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: path.closest('.ecg-divider'),
        start: 'top 92%',
        end: 'top 45%',
        scrub: true,
      },
    });
  });

  /* ────────────────────────────────────────────────
     9. VOCE — waveform canvas
     ──────────────────────────────────────────────── */
  (function wave() {
    var canvas = document.getElementById('wave-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W, H, t = 0, energy = 0;

    function resize() {
      var r = canvas.parentElement.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function draw() {
      ctx.clearRect(0, 0, W, H);
      // energia legata a quanto la sezione è visibile
      var r = canvas.parentElement.getBoundingClientRect();
      var vis = Math.max(0, Math.min(1, 1 - Math.abs(r.top + r.height / 2 - window.innerHeight / 2) / (window.innerHeight * 0.8)));
      energy += (vis - energy) * 0.04;

      var layers = [
        { amp: 46, freq: 0.012, speed: 0.030, color: 'rgba(13,148,136,0.6)', width: 2.2 },
        { amp: 30, freq: 0.020, speed: -0.022, color: 'rgba(96,140,255,0.35)', width: 1.6 },
        { amp: 62, freq: 0.008, speed: 0.016, color: 'rgba(11,82,224,0.20)', width: 1.4 },
      ];
      layers.forEach(function (L, li) {
        ctx.beginPath();
        ctx.strokeStyle = L.color;
        ctx.lineWidth = L.width;
        for (var x = 0; x <= W; x += 3) {
          var envelope = Math.sin((x / W) * Math.PI); // attenua ai bordi
          var y = H / 2 +
            Math.sin(x * L.freq + t * L.speed * 60 + li * 2) * L.amp * envelope * energy +
            Math.sin(x * L.freq * 2.7 + t * L.speed * 95) * L.amp * 0.3 * envelope * energy;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
      t += 0.016;
    }
    // Loop SOLO quando la sezione è visibile (era rAF infinito anche
    // off-screen: spreco di frame a ogni scroll). IntersectionObserver
    // avvia/ferma il loop; reduced-motion: un solo frame statico.
    if (!reducedMotion) {
      var waveRunning = false, waveRaf = null;
      var waveLoop = function () {
        draw();
        if (waveRunning) waveRaf = requestAnimationFrame(waveLoop);
      };
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && !waveRunning) {
            waveRunning = true;
            waveLoop();
          } else if (!en.isIntersecting && waveRunning) {
            waveRunning = false;
            if (waveRaf) cancelAnimationFrame(waveRaf);
            waveRaf = null;
          }
        });
      }, { threshold: 0.02 }).observe(canvas.parentElement);
    } else {
      draw();
    }
  })();

  /* ────────────────────────────────────────────────
     10. KPI counters
     ──────────────────────────────────────────────── */
  if (ANIM) {
    document.querySelectorAll('.kpi-num[data-count]').forEach(function (el) {
      var target = parseInt(el.getAttribute('data-count'), 10);
      var obj = { v: 0 };
      gsap.to(obj, {
        v: target,
        duration: 1.6,
        ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        onUpdate: function () { el.textContent = Math.round(obj.v); },
      });
    });
  } else {
    document.querySelectorAll('.kpi-num[data-count]').forEach(function (el) {
      el.textContent = el.getAttribute('data-count');
    });
  }

  /* ────────────────────────────────────────────────
     11. LEAD FORM — endpoint esistente + fallback mailto
     ──────────────────────────────────────────────── */
  (function leadForm() {
    var form = document.getElementById('lead-form');
    var note = document.getElementById('form-note');
    if (!form) return;
    var LEAD_API_URL = 'https://transcriber.82.25.101.118.nip.io/website-lead';

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = new FormData(form);
      var nome = (data.get('nome') || '').toString().trim();
      var email = (data.get('email') || '').toString().trim();
      if (!nome || !email) {
        note.textContent = 'Compila almeno nome ed email.';
        note.className = 'form-note error';
        return;
      }
      var studio = (data.get('studio') || '').toString().trim();
      var telefono = (data.get('telefono') || '').toString().trim();
      var extra = (data.get('note') || '').toString().trim();
      note.textContent = 'Invio in corso…';
      note.className = 'form-note';

      var done = function (msg, cls) {
        note.textContent = msg;
        note.className = 'form-note ' + cls;
        if (cls === 'success') form.reset();
      };

      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, 6000);
      fetch(LEAD_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          intent: 'segreteria',
          nome: nome,
          specialty: 'Segretaria AI',
          email: email,
          telefono: telefono,
          motivazione: 'Studio: ' + (studio || '—') + (extra ? ' · Note: ' + extra : ''),
          source: 'igea-site',
        }),
      }).then(function (resp) {
        clearTimeout(timeout);
        if (resp.ok) {
          done('Richiesta inviata! Ti ricontatteremo entro 24 ore.', 'success');
        } else {
          throw new Error('bad status');
        }
      }).catch(function () {
        clearTimeout(timeout);
        var subject = encodeURIComponent('Richiesta demo Segretaria AI - ' + nome);
        var body = encodeURIComponent(
          'Nome: ' + nome + '\nStudio: ' + studio + '\nEmail: ' + email +
          '\nTelefono: ' + telefono + '\n\n' + extra
        );
        window.location.href = 'mailto:info@firmamentotechnologies.com?subject=' + subject + '&body=' + body;
        done('Si è aperto il tuo client di posta: conferma l\u2019invio per completare la richiesta.', 'success');
      });
    });
  })();

  /* ────────────────────────────────────────────────
     12. Refresh ScrollTrigger: dopo i font, dopo il load completo (immagini
     che cambiano l'altezza di layout) e una volta extra a regime — e' la
     causa classica del pin che "scatta" mentre si scorre.
     ──────────────────────────────────────────────── */
  if (ANIM) {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    }
    window.addEventListener('load', function () {
      ScrollTrigger.refresh();
      setTimeout(function () { ScrollTrigger.refresh(); }, 800);
    });
  }
})();
