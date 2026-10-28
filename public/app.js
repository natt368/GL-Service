(() => {
  const C = window.GL_CONFIG;
  const $ = (sel) => document.querySelector(sel);
  const state = { raw: null, data: null, accountId: "" };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => (v === undefined || v === null || v === "" || isNaN(Number(v)) ? undefined : Number(v));
  // GrainLink links objects either by uuid string or by a nested {uuid, name}.
  const ref = (v) => (v == null ? undefined : typeof v === "object" ? String(v.uuid ?? v.id ?? v.name ?? "") || undefined : String(v));
  const refName = (v) => (v && typeof v === "object" ? v.name : typeof v === "string" ? v : undefined);
  const list = (x) => (Array.isArray(x) ? x : Array.isArray(x?.results) ? x.results : []);
  const toDate = (v) => {
    const t = v ? Date.parse(v) : NaN;
    return isNaN(t) ? null : new Date(t);
  };
  function ago(d) {
    if (!d) return "never";
    const h = (Date.now() - d.getTime()) / 36e5;
    if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
    if (h < 48) return `${Math.round(h)} h ago`;
    return `${Math.round(h / 24)} days ago`;
  }
  const len = (v) => (v === undefined ? "" : C.units === "ft" ? `${v}'` : `${v} ${C.units}`);
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  function toast(msg, isError) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "toast show" + (isError ? " error" : "");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.className = "toast"), 2600);
  }

  // ── API ────────────────────────────────────────────────────────────────────
  // Uses the local proxy (server.js) when it's there. On a static host such as
  // GitHub Pages there is no proxy, so call the API from the browser instead;
  // that only works if api.grainlink.com allows cross-origin requests.
  let useProxy = location.protocol !== "file:";
  async function apiGet(path, key) {
    let res;
    if (useProxy) {
      res = await fetch("/api/proxy?path=" + encodeURIComponent(path), { headers: { "X-GL-Key": key } });
      if (!res.headers.get("X-GL-Proxy")) useProxy = false;
    }
    if (!useProxy) {
      try {
        res = await fetch(C.api.base.replace(/\/+$/, "") + path, {
          headers: { [C.api.authHeader]: C.api.authPrefix + key, Accept: "application/json" },
        });
      } catch {
        throw new Error("The browser couldn't reach " + C.api.base + ". The API may not allow requests from this site (CORS). Run the app with npm start, or paste the API's JSON below.");
      }
    }
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    if (res.status === 401) throw new Error("GrainLink rejected this token (401). Tokens expire after 2 hours, so copy a fresh one from API Access in the GrainLink dashboard.");
    if (res.status === 502 && useProxy) throw new Error((json && json.error) || "Could not reach api.grainlink.com");
    return { ok: res.ok, status: res.status, json };
  }

  // `next` links are absolute URLs; keep only the path so they go through apiGet.
  const toPath = (url) => (/^https?:/i.test(url) ? new URL(url).pathname + new URL(url).search : url);

  async function fetchAll(path, key, log) {
    const out = [];
    let url = path + (path.includes("?") ? "&" : "?") + "limit=" + C.pageSize;
    for (let page = 0; url && page < 50; page++) {
      const r = await apiGet(url, key);
      log.push(`${r.status} GET ${url}`);
      if (!r.ok) return page ? out : null;
      out.push(...list(r.json));
      url = r.json && r.json.next ? toPath(r.json.next) : null;
    }
    return out;
  }

  async function loadFromApi(key, progress) {
    const log = [];
    const E = C.endpoints;
    const raw = {};
    progress("Checking token…");
    const me = await apiGet(E.user, key);
    log.push(`${me.status} GET ${E.user}`);
    raw.user = me.ok ? me.json : null;
    for (const name of ["accounts", "locations", "silos", "cables", "chesters", "sensors", "alarms"]) {
      progress(`Loading ${name}…`);
      raw[name] = await fetchAll(E[name], key, log);
    }
    if (!raw.silos && !raw.locations) {
      throw new Error("GrainLink didn't return any locations or bins for this token.\n" + log.join("\n"));
    }
    if (C.loadBinDetails && raw.silos?.length) {
      let done = 0;
      const queue = [...raw.silos];
      const worker = async () => {
        while (queue.length) {
          const silo = queue.shift();
          const r = await apiGet(`${E.silos}${encodeURIComponent(silo.uuid)}/`, key);
          if (r.ok && r.json) {
            for (const k of ["diameter", "eave_height", "peak_height", "hopper_height", "notes"]) {
              if (r.json[k] != null) silo[k] = r.json[k];
            }
          }
          progress(`Loading bin sizes ${++done}/${raw.silos.length}…`);
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
    }
    return raw;
  }

  // ── Turn API lists into customer → sites → gateways / bins → cables → sensors
  function sameAccount(value, acct) {
    if (!acct || value == null) return true;
    const v = String(ref(value));
    return [acct.uuid, acct.id, acct.name].filter((x) => x != null).map(String).includes(v);
  }

  function normalise(raw, accountId) {
    const accounts = list(raw.accounts);
    const acct = accounts.find((a) => String(a.uuid ?? a.id) === accountId) || (accounts.length === 1 ? accounts[0] : null);
    const user = raw.user || {};
    const userName = [user.first_name, user.last_name].filter(Boolean).join(" ");
    const customer = {
      name: acct?.name || userName || "GrainLink customer",
      contact: userName,
      phone: user.phone || "",
      email: user.email || "",
    };

    let sites = list(raw.locations)
      .filter((l) => accounts.length < 2 || sameAccount(l.account, acct))
      .map((l) => ({
        id: String(l.uuid),
        name: l.name || "Unnamed location",
        address: [l.address, l.city_name].filter(Boolean).join(", "),
        lat: num(l.latitude),
        lng: num(l.longitude),
        gateways: [],
        bins: [],
        alarms: [],
      }));
    const fallback = { id: "_other", name: "Other bins", address: "", gateways: [], bins: [], alarms: [] };
    const siteById = new Map(sites.map((s) => [s.id, s]));
    const siteByName = new Map(sites.map((s) => [s.name.toLowerCase(), s]));
    const findSite = (locRef, locName) =>
      siteById.get(String(locRef)) || (locName && siteByName.get(String(locName).toLowerCase())) || null;

    const binById = new Map();
    list(raw.silos).forEach((s) => {
      let site = findSite(ref(s.location), refName(s.location) || s.location_name);
      if (!site) {
        if (sites.length && accounts.length > 1) return; // belongs to another account
        site = fallback;
      }
      const bin = {
        id: String(s.uuid),
        name: s.name || "Unnamed bin",
        diameter: num(s.diameter),
        eaveHeight: num(s.eave_height),
        peakHeight: num(s.peak_height),
        capacity: num(s.capacity),
        level: num(s.level),
        grain: s.grain_type?.name || "",
        sensorsCount: num(s.sensors_count) ?? 0,
        onlineSensors: num(s.online_sensors_count) ?? 0,
        site,
        cables: [],
      };
      site.bins.push(bin);
      binById.set(bin.id, bin);
    });

    const cableById = new Map();
    list(raw.cables).forEach((c) => {
      const bin = binById.get(String(ref(c.silo) ?? ref(c.bin)));
      if (!bin) return;
      const cable = { id: String(c.uuid), name: c.name || `Cable ${bin.cables.length + 1}`, bin, sensors: [] };
      bin.cables.push(cable);
      cableById.set(cable.id, cable);
    });

    const sensorsByChester = new Map();
    list(raw.sensors).forEach((s) => {
      const cable = cableById.get(String(ref(s.sensor_cable)));
      if (!cable) return;
      const sensor = {
        id: String(s.uuid),
        position: num(s.position),
        name: s.name || "",
        serial: s.serial_number || "",
        status: String(s.status || "unknown").toLowerCase(),
        lastSeen: toDate(s.last_seen),
        chester: ref(s.chester),
        cable,
      };
      cable.sensors.push(sensor);
      if (sensor.chester) {
        if (!sensorsByChester.has(sensor.chester)) sensorsByChester.set(sensor.chester, []);
        sensorsByChester.get(sensor.chester).push(sensor);
      }
    });
    binById.forEach((b) => b.cables.forEach((c) => c.sensors.sort((x, y) => (x.position ?? 0) - (y.position ?? 0))));

    const gatewayById = new Map();
    list(raw.chesters).forEach((c) => {
      const uuid = String(c.uuid);
      const viaSensor = sensorsByChester.get(uuid)?.[0]?.cable.bin.site;
      const site = findSite(ref(c.location_name), refName(c.location_name)) || viaSensor || (sites.length && accounts.length > 1 ? null : fallback);
      if (!site) return;
      const backup = num(c.backup_voltage);
      const gw = {
        id: uuid,
        name: c.name || "Chester",
        serial: c.serial_number || "",
        online: c.is_online !== false,
        lastSeen: toDate(c.last_seen),
        backupVoltage: backup,
        lowBattery: C.lowBackupVoltage != null && backup !== undefined && backup <= C.lowBackupVoltage,
        sensorCount: num(c.sensor_count) ?? 0,
        onlineSensorCount: num(c.online_sensor_count) ?? 0,
        severity: c.chester_severity || "",
        site,
      };
      site.gateways.push(gw);
      gatewayById.set(uuid, gw);
    });

    const accountAlarms = [];
    list(raw.alarms).forEach((a) => {
      if (C.closedAlarmState.test(String(a.state || ""))) return;
      const alarm = {
        name: a.name || "Alarm",
        severity: String(a.severity || "info").toLowerCase(),
        description: a.description || "",
        gateway: a.chester_name || "",
        count: num(a.count),
        updated: toDate(a.updated_at || a.created_at),
      };
      const gw = gatewayById.get(String(a.chester_uuid));
      if (gw) gw.site.alarms.push(alarm);
      else if (accounts.length < 2 || !acct || !a.account_name || a.account_name === acct.name) accountAlarms.push(alarm);
    });

    if (fallback.bins.length || fallback.gateways.length) sites.push(fallback);
    if (!sites.length) sites = [fallback];
    if (accountAlarms.length) sites[0].alarms.push(...accountAlarms);
    const rank = { critical: 0, warning: 1, info: 2 };
    sites.forEach((s) => s.alarms.sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3)));
    return { customer, accounts, accountId: acct ? String(acct.uuid ?? acct.id) : "", sites };
  }

  // ── What needs doing ───────────────────────────────────────────────────────
  function cablesFor(bin) {
    const d = bin.diameter || C.defaultDiameterFt;
    return (C.cableRules.find((r) => d <= r.maxDiameter) || C.cableRules[C.cableRules.length - 1]).cables;
  }
  function cableLength(bin) {
    let l;
    if (bin.peakHeight) l = bin.peakHeight + C.cableSlackFt;
    else {
      const d = bin.diameter || C.defaultDiameterFt;
      l = (bin.eaveHeight || C.defaultEaveHeightFt) + (d / 2) * Math.tan((C.roofPitchDeg * Math.PI) / 180) + C.cableSlackFt;
    }
    return Math.ceil(l / C.cableRoundToFt) * C.cableRoundToFt;
  }
  const isMonitored = (bin) => bin.sensorsCount > 0 || bin.cables.some((c) => c.sensors.length);
  const positions = (sensors) => sensors.map((s) => "#" + (s.position ?? s.name)).join(", ");

  // Service problems for one site. Sensors behind an offline gateway are rolled
  // into that gateway's task, since they'll come back when it does.
  function siteProblems(site) {
    const offlineGw = new Set(site.gateways.filter((g) => !g.online).map((g) => g.id));
    const gateways = site.gateways.filter((g) => !g.online || g.lowBattery);
    const cables = [];
    const behindGateway = new Map();
    site.bins.forEach((bin) =>
      bin.cables.forEach((cable) => {
        const fix = cable.sensors.filter((s) => C.sensorFixStatuses.includes(s.status));
        const check = cable.sensors.filter((s) => C.sensorCheckStatuses.includes(s.status));
        const own = fix.filter((s) => !offlineGw.has(s.chester));
        fix.filter((s) => offlineGw.has(s.chester)).forEach((s) => {
          const k = s.chester;
          if (!behindGateway.has(k)) behindGateway.set(k, new Set());
          behindGateway.get(k).add(bin.name);
        });
        if (own.length || check.length) cables.push({ bin, cable, fix: own, check, all: own.length && own.length === cable.sensors.length });
      })
    );
    // Bins whose counts say sensors are down but whose cables we couldn't see.
    const binsDown = site.bins.filter(
      (b) => !b.cables.some((c) => c.sensors.length) && b.sensorsCount > b.onlineSensors
    );
    return { gateways, cables, binsDown, behindGateway };
  }

  function buildJob() {
    const jobType = $("#jobType").value;
    const selected = new Set([...document.querySelectorAll(".site-check:checked")].map((c) => c.value));
    const sites = state.data.sites.filter((s) => selected.has(s.id));

    const counts = { job: 1, gateway: 0, bin: 0, cable: 0, offlineGateway: 0, lowBattery: 0, faultyCable: 0, sensorsDown: 0, alarms: 0 };
    const cableLines = {};
    const siteJobs = sites.map((site) => {
      const p = siteProblems(site);
      const installBins = site.bins.filter((b) => !isMonitored(b));
      const needsGateway = jobType === "install" && installBins.length > 0 && !site.gateways.length;
      if (jobType === "install") {
        if (needsGateway) counts.gateway++;
        installBins.forEach((b) => {
          counts.bin++;
          const n = cablesFor(b);
          counts.cable += n;
          cableLines[cableLength(b)] = (cableLines[cableLength(b)] || 0) + n;
        });
      }
      if (jobType !== "inspection") {
        counts.offlineGateway += p.gateways.filter((g) => !g.online).length;
        counts.lowBattery += p.gateways.filter((g) => g.lowBattery).length;
      }
      counts.faultyCable += p.cables.filter((c) => c.fix.length).length;
      counts.sensorsDown += p.cables.reduce((n, c) => n + c.fix.length, 0) + p.binsDown.reduce((n, b) => n + b.sensorsCount - b.onlineSensors, 0);
      counts.alarms += site.alarms.length;
      return { site, p, installBins, needsGateway };
    });

    const supplies = [];
    if (jobType === "install") {
      Object.keys(cableLines).sort((a, b) => a - b)
        .forEach((l) => supplies.push({ item: `Temp/moisture sensor cable – ${l} ft`, qty: cableLines[l] }));
    }
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

  function tasksFor(job, sj) {
    const t = [];
    const { site, p } = sj;
    if (job.jobType === "install") {
      if (sj.needsGateway) t.push(`Mount a Chester gateway + solar panel at ${site.name} and confirm LTE signal`);
      sj.installBins.forEach((b) => t.push(`${b.name}: hang ${cablesFor(b)} × ${cableLength(b)} ft cable(s), connect to the Chester, seal the roof`));
    }
    if (job.jobType === "service") {
      p.gateways.forEach((g) => {
        if (!g.online) {
          const bins = p.behindGateway.get(g.id);
          t.push(`Get ${g.name}${g.serial ? ` (SN ${g.serial})` : ""} back online – last seen ${ago(g.lastSeen)}. Check power/solar, battery, LTE antenna and SIM; swap the unit if it's dead` +
            (bins ? `. Sensors on ${[...bins].join(", ")} should come back with it` : ""));
        }
        if (g.lowBattery) t.push(`Replace the backup battery in ${g.name} (${g.backupVoltage} V)`);
      });
      p.cables.forEach(({ bin, cable, fix, check, all }) => {
        if (all) t.push(`${bin.name} · cable ${cable.name}: no readings from any of its ${cable.sensors.length} sensors. Check the connector at the Chester and the cable run; replace the cable if it's damaged`);
        else if (fix.length) t.push(`${bin.name} · cable ${cable.name}: ${plural(fix.length, "sensor")} not reporting (${positions(fix)} of ${cable.sensors.length}). Inspect the cable and replace it if damaged`);
        if (check.length) t.push(`${bin.name} · cable ${cable.name}: unstable readings on sensor ${positions(check)}. Check the connection`);
      });
      p.binsDown.forEach((b) => t.push(`${b.name}: ${b.sensorsCount - b.onlineSensors} of ${b.sensorsCount} sensors offline. Find and fix the faulty cable`));
      if (site.alarms.length) t.push(site.alarms.length === 1 ? `Confirm the active alarm at ${site.name} clears` : `Confirm the ${site.alarms.length} active alarms at ${site.name} clear`);
    }
    if (job.jobType === "inspection") {
      site.gateways.forEach((g) => t.push(`${g.name}: check mounting, solar panel, antenna and battery`));
      site.bins.filter(isMonitored).forEach((b) => t.push(`${b.name}: inspect cables, hangers and roof seals`));
    }
    t.push(`Confirm every ${site.name} bin is reporting in the GrainLink app before leaving`);
    return t;
  }

  // ── Output: Trello markdown, checklist text, and the preview ───────────────
  const fmtDate = (d) =>
    d ? new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "TBD";
  const mapLink = (s) =>
    s.lat !== undefined && s.lng !== undefined
      ? `https://maps.google.com/?q=${s.lat},${s.lng}`
      : s.address ? `https://maps.google.com/?q=${encodeURIComponent(s.address)}` : "";
  const binDims = (b) =>
    [b.diameter ? `${len(b.diameter)} dia` : "", b.eaveHeight ? `${len(b.eaveHeight)} eave` : "", b.capacity ? `${b.capacity.toLocaleString()} bu` : ""]
      .filter(Boolean).join(" · ");
  const binSensors = (b) => {
    const total = b.cables.some((c) => c.sensors.length) ? b.cables.reduce((n, c) => n + c.sensors.length, 0) : b.sensorsCount;
    const down = b.cables.some((c) => c.sensors.length)
      ? b.cables.reduce((n, c) => n + c.sensors.filter((s) => C.sensorFixStatuses.includes(s.status)).length, 0)
      : b.sensorsCount - b.onlineSensors;
    return { total, online: total - down };
  };
  const gwLine = (g) =>
    `${g.name}${g.serial ? ` (SN ${g.serial})` : ""} – ${g.online ? "online" : "OFFLINE"}, last seen ${ago(g.lastSeen)}` +
    (g.backupVoltage !== undefined ? `, backup ${g.backupVoltage} V` : "") +
    `, ${g.onlineSensorCount}/${g.sensorCount} sensors`;
  const alarmLine = (a) => `${a.name}${a.description ? ` – ${a.description}` : ""}${a.gateway ? ` (${a.gateway})` : ""}`;

  function cardTitle(job) {
    const where = job.siteJobs.map((s) => s.site.name).join(", ");
    return `${job.priority === "urgent" ? "🔴 URGENT – " : ""}${job.jobLabel}: ${job.customer.name}${where ? " – " + where : ""} (${fmtDate(job.date)})`;
  }

  function toMarkdown(job) {
    const c = job.customer;
    const L = [];
    L.push(`## GrainLink ${job.jobLabel} – ${c.name}`, "");
    L.push(`**Date:** ${fmtDate(job.date)}  `);
    if (job.installers) L.push(`**Crew:** ${job.installers}  `);
    L.push(`**Priority:** ${job.priority[0].toUpperCase() + job.priority.slice(1)}`, "");
    L.push("### Customer");
    if (c.contact) L.push(`- **Contact:** ${c.contact}`);
    if (c.phone) L.push(`- **Phone:** ${c.phone}`);
    if (c.email) L.push(`- **Email:** ${c.email}`);
    L.push("");
    job.siteJobs.forEach((sj) => {
      const { site } = sj;
      const link = mapLink(site);
      L.push(`### 📍 ${site.name}`);
      if (site.address) L.push(`${site.address}  `);
      if (link) L.push(`[Open in Google Maps](${link})`);
      L.push("");
      if (site.gateways.length) {
        L.push("**Gateways:**");
        site.gateways.forEach((g) => L.push(`- ${g.online ? "🟢" : "🔴"} ${gwLine(g)}`));
        L.push("");
      }
      const bins = job.jobType === "install" ? sj.installBins : site.bins;
      if (bins.length) {
        L.push(`**Bins${job.jobType === "install" ? " to install" : ""}:**`);
        bins.forEach((b) => {
          const sz = binDims(b);
          const extra = job.jobType === "install"
            ? ` → ${cablesFor(b)} cable(s) @ ${cableLength(b)} ft`
            : isMonitored(b) ? ` → ${binSensors(b).online}/${binSensors(b).total} sensors reporting` : " → not monitored";
          L.push(`- **${b.name}**${sz ? " – " + sz : ""}${b.grain ? ` · ${b.grain}` : ""}${extra}`);
        });
        L.push("");
      }
      if (job.jobType !== "install" && site.alarms.length) {
        L.push("**Active alarms:**");
        site.alarms.forEach((a) => L.push(`- ${a.severity === "critical" ? "🔴" : a.severity === "warning" ? "🟠" : "🔵"} ${alarmLine(a)} · ${ago(a.updated)}`));
        L.push("");
      }
      L.push("**Tasks:**");
      tasksFor(job, sj).forEach((t) => L.push(`- ☐ ${t}`));
      L.push("");
    });
    L.push("### 🧰 Supplies to load");
    job.supplies.forEach((s) => L.push(`- ☐ ${s.qty} × ${s.item}`));
    if (job.notes) L.push("", "### 📝 Notes", job.notes);
    L.push("", `---\n_GrainLink Work Order · generated ${new Date().toLocaleString()}_`);
    return L.join("\n");
  }

  // Trello turns each pasted line into its own checklist item.
  const toSupplyChecklist = (job) => job.supplies.map((s) => `${s.qty} × ${s.item}`).join("\n");
  const toTaskChecklist = (job) =>
    job.siteJobs.flatMap((sj) => tasksFor(job, sj).map((t) => (job.siteJobs.length > 1 ? `[${sj.site.name}] ` : "") + t)).join("\n");

  function renderPreview(job) {
    const c = job.customer;
    const sitesHtml = job.siteJobs.map((sj) => {
      const { site } = sj;
      const link = mapLink(site);
      const bins = job.jobType === "install" ? sj.installBins : site.bins;
      const gwRows = site.gateways.map((g) => `<tr>
          <td><strong>${esc(g.name)}</strong>${g.serial ? `<div class="muted small">SN ${esc(g.serial)}</div>` : ""}</td>
          <td><span class="dot ${g.online ? "green" : "red"}"></span>${g.online ? "Online" : "<b>Offline</b>"}<div class="muted small">${esc(ago(g.lastSeen))}</div></td>
          <td class="num ${g.lowBattery ? "warn" : ""}">${g.backupVoltage !== undefined ? esc(g.backupVoltage) + " V" : "—"}</td>
          <td class="num ${g.onlineSensorCount < g.sensorCount ? "warn" : ""}">${g.onlineSensorCount}/${g.sensorCount}</td></tr>`).join("");
      const binRows = bins.map((b) => {
        const sz = binDims(b);
        let last;
        if (job.jobType === "install") last = `${cablesFor(b)} × ${cableLength(b)} ft`;
        else if (!isMonitored(b)) last = `<span class="muted">Not monitored</span>`;
        else {
          const s = binSensors(b);
          last = `<span class="dot ${s.online < s.total ? "red" : "green"}"></span>${s.online}/${s.total}`;
        }
        return `<tr><td><strong>${esc(b.name)}</strong>${b.grain ? `<div class="muted small">${esc(b.grain)}</div>` : ""}</td><td>${esc(sz || "—")}</td><td class="num">${last}</td></tr>`;
      }).join("");
      const alarms = job.jobType !== "install" ? site.alarms.map((a) =>
        `<li><span class="pill ${a.severity === "critical" ? "red" : a.severity === "warning" ? "amber" : "grey-dark"}">${esc(a.severity)}</span>${esc(alarmLine(a))} <span class="muted">· ${esc(ago(a.updated))}</span></li>`).join("") : "";
      return `
        <section class="wo-site">
          <div class="wo-site-head">
            <h3>📍 ${esc(site.name)}</h3>
            ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">Map ↗</a>` : ""}
          </div>
          ${site.address ? `<p class="muted">${esc(site.address)}</p>` : ""}
          ${site.gateways.length ? `<h4>Gateways</h4><div class="wo-bins-wrap"><table class="wo-bins"><thead><tr><th>Chester</th><th>Status</th><th class="num">Backup</th><th class="num">Sensors</th></tr></thead><tbody>${gwRows}</tbody></table></div>` : ""}
          ${bins.length ? `<h4>${job.jobType === "install" ? "Bins to install" : "Bins"}</h4><div class="wo-bins-wrap"><table class="wo-bins"><thead><tr><th>Bin</th><th>Size</th><th class="num">${job.jobType === "install" ? "Cables" : "Sensors reporting"}</th></tr></thead><tbody>${binRows}</tbody></table></div>`
            : `<p class="muted">${job.jobType === "install" ? "Every bin here already has sensors." : "No bins on file."}</p>`}
          ${alarms ? `<h4>Active alarms</h4><ul class="wo-issues">${alarms}</ul>` : ""}
          <h4>Tasks</h4>
          <ul class="wo-checks">${tasksFor(job, sj).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        </section>`;
    }).join("");

    const k = job.counts;
    const stats = job.jobType === "install"
      ? [[job.siteJobs.length, "sites"], [k.bin, "bins to install"], [k.cable, "cables"], [k.gateway, "gateways"]]
      : [[job.siteJobs.length, "sites"], [k.offlineGateway, "gateways offline"], [k.sensorsDown, "sensors down"], [k.alarms, "active alarms"]];

    $("#preview").innerHTML = `
      <header class="wo-head ${job.priority}">
        <div>
          <img class="wo-logo" src="brand/grainlink-logo-gold.png" alt="GrainLink">
          <div class="wo-kicker">Work Order · ${esc(job.jobLabel)}</div>
          <h2>${esc(c.name)}</h2>
          <div class="wo-meta">
            <span>📅 ${esc(fmtDate(job.date))}</span>
            ${job.installers ? `<span>👷 ${esc(job.installers)}</span>` : ""}
            <span class="pill ${job.priority === "urgent" ? "red" : job.priority === "high" ? "amber" : "gold"}">${esc(job.priority)}</span>
          </div>
        </div>
        <div class="wo-contact">
          ${c.contact ? `<div>${esc(c.contact)}</div>` : ""}
          ${c.phone ? `<div><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></div>` : ""}
          ${c.email ? `<div><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ""}
        </div>
      </header>
      <div class="wo-stats">${stats.map(([n, l]) => `<div class="${n && l !== "sites" && job.jobType === "service" ? "hot" : ""}"><b>${n}</b><span>${l}</span></div>`).join("")}</div>
      ${sitesHtml}
      <section class="wo-site">
        <h3>🧰 Supplies to load</h3>
        <ul class="wo-checks two-col">${job.supplies.map((s) => `<li><b>${s.qty}×</b> ${esc(s.item)}</li>`).join("")}</ul>
      </section>
      ${job.notes ? `<section class="wo-site"><h3>📝 Notes</h3><p class="notes">${esc(job.notes)}</p></section>` : ""}`;
  }

  // ── UI wiring ──────────────────────────────────────────────────────────────
  // Pick the job type that matches what's wrong: problems → service, bins
  // without sensors → install, otherwise a routine inspection.
  function suggestJobType(data) {
    const hasProblems = data.sites.some((s) => {
      const p = siteProblems(s);
      return s.alarms.length || p.gateways.length || p.cables.length || p.binsDown.length;
    });
    if (hasProblems) return "service";
    if (data.sites.some((s) => s.bins.some((b) => !isMonitored(b)))) return "install";
    return "inspection";
  }

  function showData(raw, accountId = "") {
    state.raw = raw;
    const data = normalise(raw, accountId);
    state.data = data;
    const bins = data.sites.reduce((n, s) => n + s.bins.length, 0);
    const gws = data.sites.reduce((n, s) => n + s.gateways.length, 0);
    $("#customerSummary").innerHTML = `<strong>${esc(data.customer.name)}</strong> · ${plural(data.sites.length, "site")} · ${plural(bins, "bin")} · ${plural(gws, "gateway")}`;

    const row = $("#accountRow");
    row.hidden = data.accounts.length < 2;
    if (!row.hidden) {
      $("#accountSel").innerHTML = data.accounts
        .slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .map((a) => `<option value="${esc(a.uuid ?? a.id)}" ${String(a.uuid ?? a.id) === data.accountId ? "selected" : ""}>${esc(a.name || a.uuid)}</option>`).join("");
    }
    $("#siteList").innerHTML = data.sites
      .map((s) => `<label class="check"><input type="checkbox" class="site-check" value="${esc(s.id)}" checked> ${esc(s.name)} <span class="muted">(${plural(s.bins.length, "bin")})</span></label>`)
      .join("");
    $("#jobType").value = suggestJobType(data);
    $("#jobPanel").hidden = false;
    $("#outputPanel").hidden = false;
    regenerate();
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
    const key = $("#apiKey").value.trim().replace(/^Bearer\s+/i, "");
    if (!key) return toast("Paste the customer's JWT token first", true);
    const btn = $("#loadBtn");
    btn.disabled = true;
    $("#loadError").hidden = true;
    try {
      const raw = await loadFromApi(key, (msg) => (btn.textContent = msg));
      showData(raw);
      $("#jobPanel").scrollIntoView({ behavior: "smooth", block: "start" });
      toast("Customer loaded");
    } catch (err) {
      $("#loadError").textContent = err.message;
      $("#loadError").hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Load customer";
    }
  });
  $("#demoBtn").addEventListener("click", () => {
    showData(window.GL_DEMO);
    $("#jobPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#toggleKey").addEventListener("click", () => {
    const i = $("#apiKey");
    i.type = i.type === "password" ? "text" : "password";
    $("#toggleKey").textContent = i.type === "password" ? "Show" : "Hide";
  });
  $("#accountSel").addEventListener("change", (e) => showData(state.raw, e.target.value));

  $("#jobPanel").addEventListener("input", (e) => e.target.id !== "accountSel" && regenerate());
  $("#jobPanel").addEventListener("change", (e) => e.target.id !== "accountSel" && regenerate());
  $("#jobDate").value = new Date(Date.now() + 864e5).toISOString().slice(0, 10);

  $("#copyTitle").addEventListener("click", () => copy(cardTitle(state.job), "Card title"));
  $("#copyDesc").addEventListener("click", () => copy($("#markdownOut").value, "Card description"));
  $("#copyTasks").addEventListener("click", () => copy(toTaskChecklist(state.job), "Task checklist"));
  $("#copySupplies").addEventListener("click", () => copy(toSupplyChecklist(state.job), "Supply checklist"));
  $("#printBtn").addEventListener("click", () => window.print());
  $("#pasteBtn").addEventListener("click", () => {
    let json;
    try { json = JSON.parse($("#pasteJson").value); } catch { return toast("That isn't valid JSON. Copy the whole API response and try again.", true); }
    if (!json || typeof json !== "object" || !["locations", "silos", "chesters", "sensors"].some((k) => k in json)) {
      return toast('Paste an object with "locations", "silos", "chesters", "sensors" (and optionally "cables", "alarms", "accounts", "user").', true);
    }
    showData(json);
  });
})();
