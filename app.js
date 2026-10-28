/* Recomp & Decomp PC — elenco progetti nativi per PC
 * Fonte dati: PCGamingWiki "List of unofficial ports" (API MediaWiki, CORS).
 * Copertine: mappa statica in data.js (libretro-thumbnails + PCGamingWiki).
 * I dati vengono riletti a ogni caricamento; se la rete manca si usa lo snapshot.
 */
(function () {
  "use strict";

  var API_URL =
    "https://www.pcgamingwiki.com/w/api.php?action=parse&page=List_of_unofficial_ports" +
    "&prop=text&format=json&origin=*";
  var META_URL =
    "https://www.pcgamingwiki.com/w/api.php?action=query&prop=revisions&rvprop=timestamp" +
    "&titles=List_of_unofficial_ports&format=json&origin=*";

  var MULTI_SECTIONS = ["Multiplatform", "DOS", "PC-98", "Mac", "Phone", "Engines"];
  var STOPWORDS = ["the", "a", "an", "and"];

  var STATUS_IT = {
    "playable": "Giocabile",
    "complete": "Completo",
    "development": "In sviluppo",
    "in progress": "In corso",
    "planned": "Pianificato",
    "pre-release": "Pre-release",
    "alpha": "Alpha",
    "beta": "Beta"
  };

  var state = {
    projects: [],
    live: false,
    updatedAt: null,
    sourceUpdatedAt: null
  };

  var els = {
    grid: document.getElementById("grid"),
    empty: document.getElementById("empty"),
    resetEmpty: document.getElementById("resetEmpty"),
    count: document.getElementById("count"),
    updated: document.getElementById("updated"),
    search: document.getElementById("search"),
    type: document.getElementById("type"),
    platform: document.getElementById("platform"),
    state: document.getElementById("state"),
    sort: document.getElementById("sort"),
    chips: document.getElementById("chips"),
    reload: document.getElementById("reload"),
    sourcePill: document.getElementById("sourcePill"),
    sourcePillText: document.getElementById("sourcePillText"),
    statusBar: document.getElementById("statusBar"),
    statusText: document.getElementById("statusText"),
    statTotal: document.getElementById("statTotal"),
    statRecomp: document.getElementById("statRecomp"),
    statDecomp: document.getElementById("statDecomp"),
    statReleased: document.getElementById("statReleased")
  };

  /* ---------------- utilità ---------------- */

  function cleanText(node) {
    if (!node) return "";
    var clone = node.cloneNode(true);
    clone.querySelectorAll("sup").forEach(function (s) { s.remove(); });
    return (clone.textContent || "")
      .replace(/\s+/g, " ")
      .replace(/\s*\[edit\]\s*$/, "")
      .trim();
  }

  function headingText(node) {
    var clone = node.cloneNode(true);
    clone.querySelectorAll(".mw-editsection").forEach(function (s) { s.remove(); });
    return (clone.textContent || "").replace(/\s+/g, " ").trim();
  }

  function classifyType(origin) {
    var o = origin.toLowerCase();
    if (o.indexOf("recompil") !== -1 || o === "hybrid") return "recomp";
    if (
      o.indexOf("decompil") !== -1 ||
      o.indexOf("disassembl") !== -1 ||
      o.indexOf("reimplement") !== -1
    ) return "decomp";
    return null;
  }

  function classifyState(status) {
    var s = status.toLowerCase();
    if (s.indexOf("playable") !== -1 || s.indexOf("complete") !== -1 || s.indexOf("100.0") !== -1) {
      return "released";
    }
    return "dev";
  }

  function statusLabel(status) {
    var key = status.toLowerCase().trim();
    if (STATUS_IT[key]) return STATUS_IT[key];
    if (key.indexOf("complete") === 0) return "Completo";
    return status || "—";
  }

  function normalizedKey(name) {
    if (!name) return "";
    var s = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    s = s.toLowerCase().replace(/&/g, " and ");
    s = s.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
    s = s.replace(/[^a-z0-9]+/g, " ").trim();
    return s.split(" ").filter(function (t) {
      return t && STOPWORDS.indexOf(t) === -1;
    }).join(" ");
  }

  function platformFamily(platform) {
    var p = (platform || "").toLowerCase();
    if (/nintendo|game boy|gamecube|wii|famicom|nes|super nintendo|3ds|ds\b/.test(p)) return "nintendo";
    if (/playstation|sony|psp|ps vita/.test(p)) return "sony";
    if (/xbox|microsoft/.test(p)) return "microsoft";
    if (/sega|genesis|dreamcast|master system|32x|game gear|saturn/.test(p)) return "sega";
    if (/arcade/.test(p)) return "arcade";
    return "pc";
  }

  function hashHue(text) {
    var h = 0;
    for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
    return h;
  }

  function initials(name) {
    var words = (name || "").replace(/[^\p{L}\p{N} ]+/gu, " ").split(/\s+/).filter(Boolean);
    var skip = ["on", "of", "the", "and", "a", "an", "for", "to", "in", "vs", "vol"];
    var letters = words.filter(function (w) {
      return /^\p{L}/u.test(w) && skip.indexOf(w.toLowerCase()) === -1;
    });
    var pick = letters.length ? letters : words.filter(function (w) {
      return skip.indexOf(w.toLowerCase()) === -1;
    });
    if (pick.length >= 2) return pick[0].charAt(0) + pick[1].charAt(0);
    if (pick.length === 1) return pick[0].slice(0, 2);
    return words.length ? words[0].slice(0, 2) : "?";
  }

  function formatDate(value) {
    if (!value) return "—";
    var d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("it-IT", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  }

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function coverFor(project) {
    var covers = (window.PCGW_SNAPSHOT && window.PCGW_SNAPSHOT.covers) || {};
    var key = normalizedKey(project.game);
    var url = covers[key];
    if (url) return url;
    return covers[normalizedKey(project.port)] || null;
  }

  /* ---------------- parsing PCGamingWiki ---------------- */

  function parsePorts(html) {
    var doc = new DOMParser().parseFromString(
      '<div id="pcgw-root">' + html + "</div>",
      "text/html"
    );
    var root = doc.getElementById("pcgw-root");
    if (!root) return [];

    var group = "";
    var platform = "";
    var projects = [];
    var seen = Object.create(null);

    /* heading e tabelle in ordine di documento: la heading definisce la
       piattaforma delle tabelle che seguono. */
    var nodes = root.querySelectorAll("h1, h2, h3, table");

    Array.prototype.forEach.call(nodes, function (node) {
      var tag = node.tagName;

      if (tag === "H1" || tag === "H2" || tag === "H3") {
        var name = headingText(node);
        if (tag === "H1") {
          group = name;
          platform = MULTI_SECTIONS.indexOf(name) !== -1 ? name : "";
        } else if (tag === "H3") {
          platform = name;
        }
        return;
      }

      if (tag !== "TABLE") return;
      if (node.parentElement && node.parentElement.closest("table")) return;

      Array.prototype.forEach.call(node.querySelectorAll("tr"), function (row) {
        var cells = Array.prototype.filter.call(row.children, function (c) {
          return c.tagName === "TD" || c.tagName === "TH";
        });
        if (cells.length < 5) return;

        var game = cleanText(cells[0]);
        var origin = cleanText(cells[2]);
        if (!game || !origin || origin === "Origin of Port") return;

        var type = classifyType(origin);
        if (!type) return;

        var port = cleanText(cells[1]);
        var dedupe = game.toLowerCase() + "|" + port.toLowerCase();
        if (seen[dedupe]) return;
        seen[dedupe] = true;

        var linkNode = cells[1].querySelector('a[href^="http"]') ||
                       cells[0].querySelector('a[href^="http"]');
        var pageNode = cells[0].querySelector('a[href^="/wiki/"]');
        var rawStatus = cleanText(cells[3]);

        projects.push({
          game: game,
          port: port,
          type: type,
          origin: origin,
          status: rawStatus,
          state: classifyState(rawStatus),
          platform: platform || group || "Altro",
          language: cleanText(cells[4]),
          notes: cells.length > 6 ? cleanText(cells[6]) : "",
          link: linkNode ? linkNode.href : "",
          page: pageNode ? "https://www.pcgamingwiki.com" + pageNode.getAttribute("href") : ""
        });
      });
    });

    return projects;
  }

  /* ---------------- caricamento dati ---------------- */

  function fetchJSON(url, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 20000);
    return fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) { clearTimeout(timer); return data; })
      .catch(function (err) { clearTimeout(timer); throw err; });
  }

  function setSourcePill(live) {
    els.sourcePill.classList.toggle("pill--live", live);
    els.sourcePill.classList.toggle("pill--warn", !live);
    els.sourcePillText.textContent = live ? "Dati live · PCGamingWiki" : "Snapshot locale · PCGamingWiki";
  }

  function setStatus(kind, text) {
    els.statusBar.hidden = false;
    els.statusBar.className = "status status--" + kind;
    els.statusText.textContent = text;
  }

  function useSnapshot(reason) {
    var snap = window.PCGW_SNAPSHOT;
    if (!snap || !Array.isArray(snap.projects) || !snap.projects.length) {
      setStatus("err", "Impossibile caricare i dati: " + (reason || "sorgente non raggiungibile") + ".");
      return;
    }
    state.projects = snap.projects;
    state.live = false;
    state.updatedAt = new Date();
    state.sourceUpdatedAt = snap.generated || null;
    setSourcePill(false);
    setStatus(
      "err",
      "Sorgente non raggiungibile (" + (reason || "offline") + "). Mostro lo snapshot locale del " +
        formatDate(snap.generated) + " · " + snap.projects.length.toLocaleString("it-IT") + " progetti."
    );
    renderAll();
  }

  function load() {
    els.reload.disabled = true;
    setStatus("loading", "Aggiornamento dalla sorgente PCGamingWiki…");

    return Promise.allSettled([fetchJSON(API_URL), fetchJSON(META_URL, 12000)]).then(function (res) {
      var parseRes = res[0];
      var metaRes = res[1];

      if (parseRes.status !== "fulfilled" || !parseRes.value || !parseRes.value.parse) {
        els.reload.disabled = false;
        useSnapshot(parseRes.reason ? String(parseRes.reason.message || parseRes.reason) : "risposta non valida");
        return;
      }

      var projects;
      try {
        projects = parsePorts(parseRes.value.parse.text["*"]);
      } catch (e) {
        els.reload.disabled = false;
        useSnapshot("parsing fallito");
        return;
      }

      if (!projects.length) {
        els.reload.disabled = false;
        useSnapshot("nessun progetto nella risposta");
        return;
      }

      state.projects = projects;
      state.live = true;
      state.updatedAt = new Date();
      state.sourceUpdatedAt = null;

      if (metaRes.status === "fulfilled") {
        try {
          var pages = metaRes.value.query.pages;
          var first = Object.keys(pages)[0];
          state.sourceUpdatedAt = pages[first].revisions[0].timestamp;
        } catch (e) { /* dato opzionale */ }
      }

      var released = projects.filter(function (p) { return p.state === "released"; }).length;
      setSourcePill(true);
      setStatus(
        "ok",
        "Dati live · " + projects.length.toLocaleString("it-IT") + " progetti (" +
          released.toLocaleString("it-IT") + " giocabili) · ultima modifica wiki: " +
          formatDate(state.sourceUpdatedAt)
      );

      els.reload.disabled = false;
      renderAll();
    });
  }

  /* ---------------- filtri ---------------- */

  function populatePlatforms() {
    var counts = Object.create(null);
    state.projects.forEach(function (p) {
      counts[p.platform] = (counts[p.platform] || 0) + 1;
    });
    var names = Object.keys(counts).sort(function (a, b) { return a.localeCompare(b, "it"); });

    els.platform.innerHTML = "";
    els.platform.appendChild(new Option("Tutte (" + state.projects.length + ")", "all"));
    names.forEach(function (name) {
      els.platform.appendChild(new Option(name + " (" + counts[name] + ")", name));
    });
  }

  function currentFilters() {
    return {
      q: els.search.value.trim(),
      type: els.type.value,
      platform: els.platform.value,
      state: els.state.value,
      sort: els.sort.value
    };
  }

  function applyFilters() {
    var f = currentFilters();
    var q = f.q.toLowerCase();

    var list = state.projects.filter(function (p) {
      if (f.type !== "all" && p.type !== f.type) return false;
      if (f.platform !== "all" && p.platform !== f.platform) return false;
      if (f.state !== "all" && p.state !== f.state) return false;
      if (q) {
        var hay = (p.game + " " + p.port + " " + p.notes + " " + p.platform).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    var collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });
    list.sort(function (a, b) {
      switch (f.sort) {
        case "name-desc":
          return collator.compare(b.game, a.game) || collator.compare(b.port, a.port);
        case "platform-asc":
          return collator.compare(a.platform, b.platform) || collator.compare(a.game, b.game);
        case "state-asc":
          return (a.state === b.state ? 0 : a.state === "released" ? -1 : 1) ||
                 collator.compare(a.game, b.game);
        default:
          return collator.compare(a.game, b.game) || collator.compare(a.port, b.port);
      }
    });

    return list;
  }

  /* ---------------- card ---------------- */

  function makeMedia(p) {
    var media = el("div", "card__media");
    var cover = coverFor(p);
    var fallback = null;

    function showFallback() {
      if (fallback) return;
      media.querySelectorAll(".card__cover, .card__bg").forEach(function (n) { n.remove(); });
      fallback = el("div", "card__fallback");
      fallback.style.setProperty("--hue", hashHue(p.game));
      fallback.style.setProperty("--hue2", (hashHue(p.game) + 55) % 360);
      fallback.appendChild(el("span", "card__monogram", initials(p.game)));
      fallback.appendChild(el("span", "card__platform", p.platform || "PC"));
      media.insertBefore(fallback, media.firstChild);
    }

    if (cover) {
      var bg = el("div", "card__bg");
      bg.style.backgroundImage = 'url("' + cover.replace(/"/g, "%22") + '")';
      media.appendChild(bg);

      var img = el("img", "card__cover");
      img.alt = "Copertina di " + p.game;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("load", function () { img.classList.add("is-loaded"); });
      img.addEventListener("error", showFallback);
      img.src = cover;
      media.appendChild(img);
      if (img.complete && img.naturalWidth) img.classList.add("is-loaded");
    } else {
      showFallback();
    }

    var overlay = el("div", "card__overlay");
    overlay.appendChild(el("span", "tag tag--" + p.type, p.type === "recomp" ? "Recomp" : "Decomp"));

    var stateTag = el("span", "tag tag--state" + (p.state === "dev" ? " is-dev" : ""));
    stateTag.appendChild(el("span", "tag__dot"));
    stateTag.appendChild(document.createTextNode(statusLabel(p.status)));
    overlay.appendChild(stateTag);

    media.appendChild(overlay);
    return media;
  }

  function makeCard(p, index) {
    var card = el("article", "card");
    card.style.setProperty("--i", Math.min(index, 10));
    card.appendChild(makeMedia(p));

    var body = el("div", "card__body");
    body.appendChild(el("h2", "card__title", p.game));

    if (p.port && p.port.toLowerCase() !== p.game.toLowerCase()) {
      body.appendChild(el("p", "card__port", p.port));
    }
    if (p.notes) body.appendChild(el("p", "card__notes", p.notes));

    var meta = el("div", "card__meta");
    var platformPill = el("span", "meta-pill meta-pill--" + platformFamily(p.platform));
    platformPill.appendChild(el("span", "meta-pill__dot"));
    platformPill.appendChild(document.createTextNode(p.platform || "PC"));
    meta.appendChild(platformPill);

    if (p.language) {
      meta.appendChild(el("span", "meta-pill", p.language));
    }
    body.appendChild(meta);

    if (p.link || p.page) {
      var links = el("div", "card__links");
      if (p.link) {
        var a = el("a", "card__link", "Progetto ↗");
        a.href = p.link;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        links.appendChild(a);
      }
      if (p.page) {
        var b = el("a", "card__link card__link--ghost", "Scheda PCGW");
        b.href = p.page;
        b.target = "_blank";
        b.rel = "noopener noreferrer";
        links.appendChild(b);
      }
      body.appendChild(links);
    }

    card.appendChild(body);
    return card;
  }

  function skeletonCard() {
    var card = el("article", "card card--skeleton");
    card.appendChild(el("div", "sk sk--media"));
    var body = el("div", "sk-body");
    body.appendChild(el("div", "sk sk--line sk--title"));
    body.appendChild(el("div", "sk sk--line sk--short"));
    body.appendChild(el("div", "sk sk--line"));
    body.appendChild(el("div", "sk sk--pill"));
    card.appendChild(body);
    return card;
  }

  function renderSkeleton(n) {
    els.grid.innerHTML = "";
    var frag = document.createDocumentFragment();
    for (var i = 0; i < (n || 8); i++) frag.appendChild(skeletonCard());
    els.grid.appendChild(frag);
  }

  /* ---------------- chips filtri ---------------- */

  function activeFilters() {
    var f = currentFilters();
    var out = [];
    if (f.q) out.push({ key: "q", label: "Cerca: " + f.q });
    if (f.type !== "all") out.push({ key: "type", label: f.type === "recomp" ? "Recomp" : "Decomp" });
    if (f.platform !== "all") out.push({ key: "platform", label: f.platform });
    if (f.state !== "released") {
      out.push({ key: "state", label: f.state === "all" ? "Tutti gli stati" : "In sviluppo" });
    }
    if (f.sort !== "name-asc") {
      out.push({ key: "sort", label: "Ordina: " + els.sort.options[els.sort.selectedIndex].text });
    }
    return out;
  }

  function renderChips() {
    var active = activeFilters();
    els.chips.innerHTML = "";
    els.chips.hidden = active.length === 0;
    if (!active.length) return;

    active.forEach(function (f) {
      var chip = el("span", "chip");
      chip.appendChild(document.createTextNode(f.label));
      var x = el("button", "chip__x", "×");
      x.type = "button";
      x.setAttribute("aria-label", "Rimuovi filtro " + f.label);
      x.addEventListener("click", function () {
        if (f.key === "q") els.search.value = "";
        else if (f.key === "type") els.type.value = "all";
        else if (f.key === "platform") els.platform.value = "all";
        else if (f.key === "state") els.state.value = "released";
        else if (f.key === "sort") els.sort.value = "name-asc";
        renderList();
        syncURL();
      });
      chip.appendChild(x);
      els.chips.appendChild(chip);
    });

    var reset = el("button", "chips__reset", "Azzera tutto");
    reset.type = "button";
    reset.addEventListener("click", resetFilters);
    els.chips.appendChild(reset);
  }

  function resetFilters() {
    els.search.value = "";
    els.type.value = "all";
    els.platform.value = "all";
    els.state.value = "released";
    els.sort.value = "name-asc";
    renderList();
    syncURL();
  }

  /* ---------------- rendering ---------------- */

  function renderList() {
    var list = applyFilters();

    els.grid.innerHTML = "";
    var frag = document.createDocumentFragment();
    list.forEach(function (p, i) { frag.appendChild(makeCard(p, i)); });
    els.grid.appendChild(frag);

    els.empty.hidden = list.length > 0;

    var total = state.projects.length;
    els.count.textContent = list.length.toLocaleString("it-IT") +
      (list.length === 1 ? " progetto" : " progetti") +
      (list.length !== total ? " di " + total.toLocaleString("it-IT") : "");

    els.updated.textContent = state.live
      ? "dati live · aggiornato " + formatDate(state.updatedAt)
      : "snapshot locale · " + formatDate(state.updatedAt);

    renderChips();
  }

  function renderStats() {
    var recomp = 0, decomp = 0, released = 0;
    state.projects.forEach(function (p) {
      if (p.type === "recomp") recomp++; else decomp++;
      if (p.state === "released") released++;
    });
    els.statTotal.textContent = state.projects.length.toLocaleString("it-IT");
    els.statRecomp.textContent = recomp.toLocaleString("it-IT");
    els.statDecomp.textContent = decomp.toLocaleString("it-IT");
    els.statReleased.textContent = released.toLocaleString("it-IT");

    /* contatori nelle tendine, così si vede subito quanto si sta filtrando */
    var n = function (v) { return " (" + v.toLocaleString("it-IT") + ")"; };
    els.type.options[0].textContent = "Tutti" + n(state.projects.length);
    els.type.options[1].textContent = "Recomp" + n(recomp);
    els.type.options[2].textContent = "Decomp" + n(decomp);
    els.state.options[0].textContent = "Giocabili" + n(released);
    els.state.options[1].textContent = "Tutti" + n(state.projects.length);
    els.state.options[2].textContent = "In sviluppo" + n(state.projects.length - released);
  }

  function renderAll() {
    populatePlatforms();
    renderStats();
    renderList();
  }

  /* ---------------- URL ---------------- */

  function syncURL() {
    var f = currentFilters();
    var params = new URLSearchParams();
    if (f.q) params.set("q", f.q);
    if (f.type !== "all") params.set("type", f.type);
    if (f.platform !== "all") params.set("platform", f.platform);
    if (f.state !== "released") params.set("state", f.state);
    if (f.sort !== "name-asc") params.set("sort", f.sort);
    var qs = params.toString();
    try {
      history.replaceState(null, "", qs ? "?" + qs : location.pathname);
    } catch (e) { /* file:// in alcuni browser */ }
  }

  function setSelectValue(select, value) {
    if (!value) return;
    var found = Array.prototype.some.call(select.options, function (o) { return o.value === value; });
    if (found) select.value = value;
  }

  function readURL() {
    var params = new URLSearchParams(location.search);
    if (params.get("q")) els.search.value = params.get("q");
    setSelectValue(els.type, params.get("type"));
    setSelectValue(els.state, params.get("state"));
    setSelectValue(els.sort, params.get("sort"));
    return params.get("platform");
  }

  /* ---------------- eventi ---------------- */

  var debounce;
  els.search.addEventListener("input", function () {
    clearTimeout(debounce);
    debounce = setTimeout(function () { renderList(); syncURL(); }, 130);
  });

  [els.type, els.platform, els.state, els.sort].forEach(function (select) {
    select.addEventListener("change", function () { renderList(); syncURL(); });
  });

  els.reload.addEventListener("click", function () { load(); });
  els.resetEmpty.addEventListener("click", resetFilters);

  document.addEventListener("keydown", function (e) {
    var tag = (e.target.tagName || "").toLowerCase();
    var typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;

    if (e.key === "/" && !typing) {
      e.preventDefault();
      els.search.focus();
      els.search.select();
    } else if (e.key === "Escape" && document.activeElement === els.search) {
      els.search.value = "";
      renderList();
      syncURL();
      els.search.blur();
    }
  });

  /* ---------------- avvio ---------------- */

  var wantedPlatform = readURL();
  renderSkeleton(8);

  load().then(function () {
    if (wantedPlatform && els.platform.querySelector('option[value="' + CSS.escape(wantedPlatform) + '"]')) {
      els.platform.value = wantedPlatform;
      renderList();
    }
  });
})();
