// ─────────────────────────────────────────────────────────────────────────────
// GL-Service configuration. Edit this file to match the real GrainLink API and
// your installer kit. Nothing else in the app needs to change.
// ─────────────────────────────────────────────────────────────────────────────
window.GL_CONFIG = {
  // Used when the page calls the API straight from the browser (e.g. on GitHub
  // Pages). When running server.js, the server's env vars are used instead.
  api: {
    base: "https://api.grainlink.com",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
  },

  // Endpoints to load, relative to api.grainlink.com. For each resource the app
  // tries the paths in order and uses the first one that answers 200 OK.
  // A response may be a bare array or wrapped as {data|items|results|<name>: [...]}.
  endpoints: {
    account: ["/v1/account", "/v1/me", "/v1/customer", "/account", "/me"],
    sites: ["/v1/sites", "/v1/farms", "/v1/locations", "/sites", "/farms"],
    bins: ["/v1/bins", "/v1/structures", "/bins"],
    devices: ["/v1/devices", "/v1/sensors", "/v1/hubs", "/devices", "/sensors"],
  },

  // Field-name aliases. The first one present on an object wins.
  fields: {
    id: ["id", "_id", "uuid", "bin_id", "site_id", "device_id"],
    name: ["name", "title", "label", "display_name", "bin_name", "site_name"],
    customer: ["company", "company_name", "customer_name", "organization", "name", "full_name"],
    contact: ["contact_name", "owner", "full_name", "name"],
    phone: ["phone", "phone_number", "mobile", "contact_phone"],
    email: ["email", "contact_email"],
    address: ["address", "street", "address1", "location", "full_address"],
    city: ["city", "town"],
    state: ["state", "province", "region"],
    lat: ["lat", "latitude"],
    lng: ["lng", "lon", "long", "longitude"],
    siteRef: ["site_id", "siteId", "farm_id", "farmId", "location_id", "site"],
    binRef: ["bin_id", "binId", "structure_id", "bin"],
    diameter: ["diameter_ft", "diameterFt", "diameter", "bin_diameter"],
    eaveHeight: ["eave_height_ft", "eaveHeightFt", "eave_height", "height_ft", "height", "sidewall_height"],
    capacity: ["capacity_bu", "capacity", "bushels"],
    commodity: ["commodity", "crop", "grain", "grain_type"],
    cables: ["cable_count", "cables", "num_cables", "sensor_cables"],
    type: ["type", "device_type", "model", "kind", "category"],
    serial: ["serial", "serial_number", "sn", "imei", "device_id", "id"],
    status: ["status", "state", "connection_status"],
    online: ["online", "is_online", "connected"],
    battery: ["battery", "battery_pct", "battery_level", "batteryPercent"],
    signal: ["signal", "rssi", "signal_strength"],
    lastSeen: ["last_seen", "lastSeen", "last_reading_at", "last_report", "updated_at"],
  },

  // Bin-diameter (ft) → number of temperature/moisture cables.
  // Each row: up to `maxDiameter` ft needs `cables` cables. Adjust to your spec.
  cableRules: [
    { maxDiameter: 24, cables: 1 },
    { maxDiameter: 30, cables: 1 },
    { maxDiameter: 36, cables: 3 },
    { maxDiameter: 42, cables: 4 },
    { maxDiameter: 48, cables: 5 },
    { maxDiameter: 60, cables: 7 },
    { maxDiameter: 72, cables: 10 },
    { maxDiameter: 9999, cables: 13 },
  ],
  roofPitchDeg: 30,        // used to estimate the roof rise for cable length
  cableSlackFt: 3,         // extra length for hanging hardware
  cableRoundToFt: 5,       // round cable lengths up to this increment
  defaultDiameterFt: 30,   // used when the API doesn't report a diameter
  defaultEaveHeightFt: 24, // used when the API doesn't report an eave height
  lowBatteryPct: 20,       // devices at or below this are flagged for a swap
  staleHours: 24,          // devices not seen for this long are flagged offline

  // Kit items. `per`: "job" | "site" | "bin" | "cable" | "offlineDevice" | "lowBattery".
  // `qty` is multiplied by the count of `per`. Jobs that don't need an item can
  // untick it in the app.
  supplies: [
    { item: "GrainLink Hub / Gateway", per: "site", qty: 1, jobs: ["install"] },
    { item: "Solar panel + mounting bracket", per: "site", qty: 1, jobs: ["install"] },
    { item: "Bin roof transmitter (node)", per: "bin", qty: 1, jobs: ["install"] },
    { item: "Cable roof-hanger bracket", per: "cable", qty: 1, jobs: ["install"] },
    { item: "Cable anchor / weight", per: "cable", qty: 1, jobs: ["install"] },
    { item: "Roof cap / weather seal", per: "cable", qty: 1, jobs: ["install"] },
    { item: "Self-tapping roof screws (box)", per: "bin", qty: 1, jobs: ["install"] },
    { item: "UV zip ties (bag)", per: "site", qty: 1, jobs: ["install", "service"] },
    { item: "Silicone sealant tube", per: "bin", qty: 1, jobs: ["install"] },
    { item: "Spare transmitter (swap unit)", per: "offlineDevice", qty: 1, jobs: ["service"] },
    { item: "Replacement battery pack", per: "lowBattery", qty: 1, jobs: ["service", "install"] },
    { item: "Harness + fall-protection lanyard", per: "job", qty: 1, jobs: ["install", "service", "inspection"] },
    { item: "Drill/driver + bits, step bit", per: "job", qty: 1, jobs: ["install", "service"] },
    { item: "Multimeter", per: "job", qty: 1, jobs: ["install", "service", "inspection"] },
    { item: "Phone/tablet with GrainLink app logged in", per: "job", qty: 1, jobs: ["install", "service", "inspection"] },
  ],
};
