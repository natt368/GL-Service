(() => {
  const C = window.GL_CONFIG;
  const $ = (sel) => document.querySelector(sel);
  const state = { data: null, supplies: [] };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function pick(obj, field) {
    if (!obj || typeof obj !== "object") return undefined;
    for (const k of C.fields[field] || [field]) {
      const v = obj[k];
      if (v !== undefined && v !== null && v !== "") return typeof v === "object" && !Array.isArray(v) ? v.id ?? v.name ?? v : v;
    }
    return undefined;
  }
  const num = (v) => (v === undefined || v === null || v === "" || isNaN(Number(v)) ? undefined : Number(v));

  function unwrap(json, name) {
    if (Array.isArray(json)) return json;
    if (!json || typeof json !== "object") return [];
    for (const k of [name, "data", "items", "results", "records"]) {
      if (Array.isArray(json[k])) return json[k];
      if (json[k] && typeof json[k] === "object") {
        const inner = unwrap(json[k], name);
        if (inner.length) return inner;
      }
    }
    return [];
  }

  function toast(msg, isError) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "toast show" + (isError ? " error" : "");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.className = "toast"), 2600);
  }

  // ── API ────────────────────────────────────────────────────────────────────
  async function apiGet(path, key) {
    const res = await fetch("/api/proxy?path=" + encodeURIComponent(path), { headers: { "X-GL-Key": key } });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { ok: res.ok, status: res.status, json };
  }

  async function loadResource(name, key, log) {
    for (const path of C.endpoints[name]) {
      const r = await apiGet(path, key);
      log.push(`${r.status} GET ${path}`);
      if (r.status === 401 || r.status === 403) throw new Error("The API rejected this key (" + r.status + "). Check the key and try again.");
      if (r.status === 502) throw new Error((r.json && r.json.error) || "Could not reach api.grainlink.com");
      if (r.ok) return r.json;
    }
    return null;
  }

  async function loadFromApi(key) {
    const log = [];
    const raw = {};
    for (const name of Object.keys(C.endpoints)) raw[name] = await loadResource(name, key, log);
    if (!raw.sites && !raw.bins && !raw.devices) {
      throw new Error("No sites, bins or devices endpoints answered. Update endpoints in public/config.js.\n" + log.join("\n"));
    }
    return raw;
  }

  // ── Normalise whatever the API returns into customer → sites → bins/devices ─
  function normalise(raw) {
    const acct = Array.isArray(raw.account) ? raw.account[0] : raw.account?.data || raw.account || {};
    const customer = {
      name: pick(acct, "customer") || "GrainLink Customer",
      contact: pick(acct, "contact") || "",
      phone: pick(acct, "phone") || "",
      email: pick(acct, "email") || "",
    };

    let sites = unwrap(raw.sites, "sites").map((s, i) => ({
      id: String(pick(s, "id") ?? "site" + i),
      name: pick(s, "name") || "Site " + (i + 1),
      address: [pick(s, "address"), pick(s, "city"), pick(s, "state")].filter((x) => typeof x === "string").join(", "),
      lat: num(pick(s, "lat")),
      lng: num(pick(s, "lng")),
      bins: [],
      devices: [],
      _rawBins: unwrap(s, "bins"),
      _rawDevices: unwrap(s, "devices"),
    }));
    if (!sites.length) sites = [{ id: "_default", name: "Main Site", address: "", bins: [], devices: [], _rawBins: [], _rawDevices: [] }];
    const siteById = Object.fromEntries(sites.map((s) => [s.id, s]));
    const siteFor = (obj) => siteById[String(pick(obj, "siteRef"))] || sites[0];

    const binById = {};
    const addBin = (b, site, i) => {
      const bin = {
        id: String(pick(b, "id") ?? site.id + "-bin" + i),
        name: pick(b, "name") || "Bin " + (site.bins.length + 1),
        diameter: num(pick(b, "diameter")),
        eaveHeight: num(pick(b, "eaveHeight")),
        capacity: num(pick(b, "capacity")),
        commodity: pick(b, "commodity") || "",
        cables: num(pick(b, "cables")),
        devices: [],
      };
      site.bins.push(bin);
      binById[bin.id] = bin;
    };
    sites.forEach((s) => s._rawBins.forEach((b, i) => addBin(b, s, i)));
    unwrap(raw.bins, "bins").forEach((b, i) => {
      if (!binById[String(pick(b, "id"))]) addBin(b, siteFor(b), i);
    });

    const now = Date.now();
    const addDevice = (d, site) => {
      let lastSeen = pick(d, "lastSeen");
      if (lastSeen === "__recent__") lastSeen = new Date(now - 20 * 60e3).toISOString();
      if (lastSeen === "__stale__") lastSeen = new Date(now - 4 * 864e5).toISOString();
      const seenMs = lastSeen ? Date.parse(typeof lastSeen === "number" && lastSeen < 1e12 ? lastSeen * 1000 : lastSeen) : NaN;
      const statusRaw = pick(d, "status");
      const onlineFlag = pick(d, "online");
      let online = onlineFlag !== undefined ? !!onlineFlag : statusRaw ? /online|active|ok|connected|good/i.test(String(statusRaw)) : true;
      if (!isNaN(seenMs) && now - seenMs > C.staleHours * 36e5) online = false;
      const dev = {
        serial: String(pick(d, "serial") ?? "—"),
        type: String(pick(d, "type") ?? "device"),
        online,
        battery: num(pick(d, "battery")),
        signal: pick(d, "signal"),
        lastSeen: isNaN(seenMs) ? null : new Date(seenMs),
      };
      dev.lowBattery = dev.battery !== undefined && dev.battery <= C.lowBatteryPct;
      const bin = binById[String(pick(d, "binRef"))];
      dev.binName = bin ? bin.name : "";
      if (bin) bin.devices.push(dev);
      site.devices.push(dev);
    };
    sites.forEach((s) => s._rawDevices.forEach((d) => addDevice(d, s)));
    unwrap(raw.devices, "devices").forEach((d) => addDevice(d, siteFor(d)));

    sites.forEach((s) => { delete s._rawBins; delete s._rawDevices; });
    return { customer, sites };
  }

  // ── Cable + supply maths ───────────────────────────────────────────────────
  function cablesFor(bin) {
    if (bin.cables) return bin.cables;
    const d = bin.diameter || C.defaultDiameterFt;
    return (C.cableRules.find((r) => d <= r.maxDiameter) || C.cableRules[C.cableRules.length - 1]).cables;
  }
  function cableLengthFt(bin) {
    const d = bin.diameter || C.defaultDiameterFt;
    const eave = bin.eaveHeight || C.defaultEaveHeightFt;
    const rise = (d / 2) * Math.tan((C.roofPitchDeg * Math.PI) / 180);
    const len = eave + rise + C.cableSlackFt;
    return Math.ceil(len / C.cableRoundToFt) * C.cableRoundToFt;
  }

  function buildJob() {
    const jobType = $("#jobType").value;
    const selected = new Set([...document.querySelectorAll(".site-check:checked")].map((c) => c.value));
    const sites = state.data.sites.filter((s) => selected.has(s.id));

    const counts = { job: 1, site: 0, bin: 0, cable: 0, offlineDevice: 0, lowBattery: 0 };
    const cableLines = {};
    const siteJobs = sites.map((site) => {
      // For installs, bins with no transmitter yet are the work; if nothing is
      // installed at the site, every bin is.
      const bins = jobType === "install"
        ? site.bins.filter((b) => !b.devices.length)
        : site.bins;
      const offline = site.devices.filter((d) => !d.online);
      const lowBatt = site.devices.filter((d) => d.lowBattery);
      const needsHub = jobType === "install" && !site.devices.some((d) => /hub|gateway/i.test(d.type));
      if (needsHub) counts.site++;
      if (jobType === "install") {
        bins.forEach((b) => {
          counts.bin++;
          const n = cablesFor(b);
          counts.cable += n;
          const len = cableLengthFt(b);
          cableLines[len] = (cableLines[len] || 0) + n;
        });
      }
      if (jobType !== "inspection") {
        counts.offlineDevice += offline.length;
        counts.lowBattery += lowBatt.length;
      }
      return { site, bins, offline, lowBatt, needsHub };
    });

    const supplies = [];
    Object.keys(cableLines)
      .sort((a, b) => a - b)
      .forEach((len) => supplies.push({ item: `Temp/moisture sensor cable – ${len} ft`, qty: cableLines[len] }));
    C.supplies.forEach((s) => {
      if (!s.jobs.includes(jobType)) return;
      const qty = s.qty * (counts[s.per] ?? 0);
      if (qty > 0) supplies.push({ item: s.item, qty });
    });
    $("#extraSupplies").value.split("\n").map((l) => l.trim()).filter(Boolean).forEach((l) => {
      const m = l.match(/^(\d+)\s*[x×]?\s+(.+)$/i);
      supplies.push(m ? { item: m[2], qty: Number(m[1]) } : { item: l, qty: 1 });
    });

    return {
      jobType,
      jobLabel: { install: "New Install", service: "Service Call", inspection: "Inspection" }[jobType],
      date: $("#jobDate").value,
      installers: $("#installers").value.trim(),
      priority: $("#priority").value,
      notes: $("#notes").value.trim(),
      customer: state.data.customer,
      siteJobs,
      supplies,
      counts,
    };
  }

  // ── Output: Trello markdown, checklist text, and the pretty preview ─────────
  const fmtDate = (d) =>
    d ? new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "TBD";
  const mapLink = (s) =>
    s.lat !== undefined && s.lng !== undefined
      ? `https://maps.google.com/?q=${s.lat},${s.lng}`
      : s.address ? `https://maps.google.com/?q=${encodeURIComponent(s.address)}` : "";
  const binDims = (b) =>
    [b.diameter ? `${b.diameter}' dia` : "", b.eaveHeight ? `${b.eaveHeight}' eave` : "", b.capacity ? `${b.capacity.toLocaleString()} bu` : "", b.commodity]
      .filter(Boolean).join(" · ");
  const devLine = (d) =>
    `${d.type} ${d.serial}${d.binName ? ` (${d.binName})` : ""}` +
    (d.battery !== undefined ? ` – ${d.battery}% batt` : "") +
    (d.lastSeen ? ` – last seen ${d.lastSeen.toLocaleString()}` : "");

  function cardTitle(job) {
    const where = job.siteJobs.map((s) => s.site.name).join(", ");
    return `${job.priority === "urgent" ? "🔴 URGENT – " : ""}${job.jobLabel}: ${job.customer.name}${where ? " – " + where : ""} (${fmtDate(job.date)})`;
  }

  function tasksFor(job, sj) {
    const t = [];
    if (job.jobType === "install") {
      if (sj.needsHub) t.push(`Mount hub + solar panel at ${sj.site.name}, confirm cell/radio signal`);
      sj.bins.forEach((b) => t.push(`${b.name}: hang ${cablesFor(b)} × ${cableLengthFt(b)} ft cable(s), mount transmitter, seal roof`));
    }
    if (job.jobType !== "inspection") {
      sj.offline.forEach((d) => t.push(`Diagnose offline ${d.type} ${d.serial}${d.binName ? ` on ${d.binName}` : ""}`));
      sj.lowBatt.forEach((d) => t.push(`Replace battery: ${d.type} ${d.serial}${d.binName ? ` on ${d.binName}` : ""} (${d.battery}%)`));
    }
    if (job.jobType === "inspection") {
      sj.bins.forEach((b) => t.push(`${b.name}: inspect cables, hangers, roof seal and transmitter`));
    }
    t.push(`Verify all ${sj.site.name} readings in the GrainLink app before leaving`);
    return t;
  }

  function toMarkdown(job) {
    const c = job.customer;
    const L = [];
    L.push(`## 🌾 ${job.jobLabel} – ${c.name}`);
    L.push("");
    L.push(`**Date:** ${fmtDate(job.date)}  `);
    if (job.installers) L.push(`**Crew:** ${job.installers}  `);
    L.push(`**Priority:** ${job.priority[0].toUpperCase() + job.priority.slice(1)}`);
    L.push("");
    L.push("### 👤 Customer");
    if (c.contact) L.push(`- **Contact:** ${c.contact}`);
    if (c.phone) L.push(`- **Phone:** ${c.phone}`);
    if (c.email) L.push(`- **Email:** ${c.email}`);
    L.push("");
    job.siteJobs.forEach((sj) => {
      const link = mapLink(sj.site);
      L.push(`### 📍 ${sj.site.name}`);
      if (sj.site.address) L.push(`${sj.site.address}  `);
      if (link) L.push(`[Open in Google Maps](${link})`);
      L.push("");
      const bins = job.jobType === "install" ? sj.bins : sj.site.bins;
      if (bins.length) {
        L.push(`**Bins${job.jobType === "install" ? " to install" : ""}:**`);
        bins.forEach((b) => {
          const extra = job.jobType === "install" ? ` → ${cablesFor(b)} cable(s) @ ${cableLengthFt(b)} ft` : "";
          L.push(`- **${b.name}**${binDims(b) ? " – " + binDims(b) : ""}${extra}`);
        });
        L.push("");
      }
      const issues = [...sj.offline.map((d) => "🔴 Offline: " + devLine(d)), ...sj.lowBatt.map((d) => "🟠 Low battery: " + devLine(d))];
      if (issues.length) {
        L.push("**Device issues:**");
        issues.forEach((i) => L.push("- " + i));
        L.push("");
      }
      L.push("**Tasks:**");
      tasksFor(job, sj).forEach((t) => L.push(`- ☐ ${t}`));
      L.push("");
    });
    L.push("### 🧰 Supplies to load");
    job.supplies.forEach((s) => L.push(`- ☐ ${s.qty} × ${s.item}`));
    if (job.notes) {
      L.push("");
      L.push("### 📝 Notes");
      L.push(job.notes);
    }
    L.push("");
    L.push(`---\n_Generated by GL-Service · ${new Date().toLocaleString()}_`);
    return L.join("\n");
  }

  // Trello turns each pasted line into its own checklist item.
  const toSupplyChecklist = (job) => job.supplies.map((s) => `${s.qty} × ${s.item}`).join("\n");
  const toTaskChecklist = (job) => job.siteJobs.flatMap((sj) => tasksFor(job, sj).map((t) => (job.siteJobs.length > 1 ? `[${sj.site.name}] ` : "") + t)).join("\n");

  function renderPreview(job) {
    const c = job.customer;
    const sitesHtml = job.siteJobs.map((sj) => {
      const link = mapLink(sj.site);
      const bins = job.jobType === "install" ? sj.bins : sj.site.bins;
      const issues = [
        ...sj.offline.map((d) => `<li><span class="pill red">Offline</span>${esc(devLine(d))}</li>`),
        ...sj.lowBatt.map((d) => `<li><span class="pill amber">Low battery</span>${esc(devLine(d))}</li>`),
      ];
      return `
        <section class="wo-site">
          <div class="wo-site-head">
            <h3>📍 ${esc(sj.site.name)}</h3>
            ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">Map ↗</a>` : ""}
          </div>
          ${sj.site.address ? `<p class="muted">${esc(sj.site.address)}</p>` : ""}
          ${bins.length ? `<table class="wo-bins"><thead><tr><th>Bin</th><th>Size</th>${job.jobType === "install" ? "<th>Cables</th>" : "<th>Devices</th>"}</tr></thead><tbody>
            ${bins.map((b) => `<tr><td><strong>${esc(b.name)}</strong></td><td>${esc(binDims(b) || "—")}</td>
              <td>${job.jobType === "install" ? `${cablesFor(b)} × ${cableLengthFt(b)} ft` : b.devices.length ? b.devices.map((d) => `<span class="dot ${d.online ? (d.lowBattery ? "amber" : "green") : "red"}"></span>${esc(d.serial)}`).join(" ") : "—"}</td></tr>`).join("")}
          </tbody></table>` : `<p class="muted">${job.jobType === "install" ? "All bins already have transmitters." : "No bins on file."}</p>`}
          ${issues.length ? `<h4>Device issues</h4><ul class="wo-issues">${issues.join("")}</ul>` : ""}
          <h4>Tasks</h4>
          <ul class="wo-checks">${tasksFor(job, sj).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        </section>`;
    }).join("");

    $("#preview").innerHTML = `
      <header class="wo-head ${job.priority}">
        <div>
          <div class="wo-kicker">GrainLink Work Order · ${esc(job.jobLabel)}</div>
          <h2>${esc(c.name)}</h2>
          <div class="wo-meta">
            <span>📅 ${esc(fmtDate(job.date))}</span>
            ${job.installers ? `<span>👷 ${esc(job.installers)}</span>` : ""}
            <span class="pill ${job.priority === "urgent" ? "red" : job.priority === "high" ? "amber" : "grey"}">${esc(job.priority)}</span>
          </div>
        </div>
        <div class="wo-contact">
          ${c.contact ? `<div>${esc(c.contact)}</div>` : ""}
          ${c.phone ? `<div><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></div>` : ""}
          ${c.email ? `<div><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ""}
        </div>
      </header>
      <div class="wo-stats">
        <div><b>${job.siteJobs.length}</b><span>site${job.siteJobs.length === 1 ? "" : "s"}</span></div>
        <div><b>${job.jobType === "install" ? job.counts.bin : job.siteJobs.reduce((n, s) => n + s.site.bins.length, 0)}</b><span>bins</span></div>
        <div><b>${job.counts.cable}</b><span>cables</span></div>
        <div><b>${job.siteJobs.reduce((n, s) => n + s.offline.length + s.lowBatt.length, 0)}</b><span>device issues</span></div>
      </div>
      ${sitesHtml}
      <section class="wo-site">
        <h3>🧰 Supplies to load</h3>
        <ul class="wo-checks two-col">${job.supplies.map((s) => `<li><b>${s.qty}×</b> ${esc(s.item)}</li>`).join("")}</ul>
      </section>
      ${job.notes ? `<section class="wo-site"><h3>📝 Notes</h3><p class="notes">${esc(job.notes)}</p></section>` : ""}`;
  }

  // ── UI wiring ──────────────────────────────────────────────────────────────
  function showData(data) {
    state.data = data;
    const totalBins = data.sites.reduce((n, s) => n + s.bins.length, 0);
    const totalDev = data.sites.reduce((n, s) => n + s.devices.length, 0);
    $("#customerSummary").innerHTML = `<strong>${esc(data.customer.name)}</strong> · ${data.sites.length} site(s) · ${totalBins} bin(s) · ${totalDev} device(s)`;
    $("#siteList").innerHTML = data.sites
      .map((s) => `<label class="check"><input type="checkbox" class="site-check" value="${esc(s.id)}" checked> ${esc(s.name)} <span class="muted">(${s.bins.length} bins)</span></label>`)
      .join("");
    $("#jobPanel").hidden = false;
    $("#outputPanel").hidden = false;
    regenerate();
    $("#jobPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function regenerate() {
    if (!state.data) return;
    const job = buildJob();
    state.job = job;
    renderPreview(job);
    $("#markdownOut").value = toMarkdown(job);
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast(`${label} copied – paste it into Trello`);
  }

  $("#keyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = $("#apiKey").value.trim();
    if (!key) return toast("Enter the customer's API key", true);
    const btn = $("#loadBtn");
    btn.disabled = true;
    btn.textContent = "Loading…";
    $("#loadError").hidden = true;
    try {
      showData(normalise(await loadFromApi(key)));
      toast("Customer loaded");
    } catch (err) {
      $("#loadError").textContent = err.message;
      $("#loadError").hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Load customer";
    }
  });
  $("#demoBtn").addEventListener("click", () => showData(normalise(window.GL_DEMO)));
  $("#toggleKey").addEventListener("click", () => {
    const i = $("#apiKey");
    i.type = i.type === "password" ? "text" : "password";
    $("#toggleKey").textContent = i.type === "password" ? "Show" : "Hide";
  });

  $("#jobPanel").addEventListener("input", regenerate);
  $("#jobPanel").addEventListener("change", regenerate);
  $("#jobDate").value = new Date(Date.now() + 864e5).toISOString().slice(0, 10);

  $("#copyTitle").addEventListener("click", () => copy(cardTitle(state.job), "Card title"));
  $("#copyDesc").addEventListener("click", () => copy($("#markdownOut").value, "Card description"));
  $("#copyTasks").addEventListener("click", () => copy(toTaskChecklist(state.job), "Task checklist"));
  $("#copySupplies").addEventListener("click", () => copy(toSupplyChecklist(state.job), "Supply checklist"));
  $("#printBtn").addEventListener("click", () => window.print());
})();
