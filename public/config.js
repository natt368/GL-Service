// ─────────────────────────────────────────────────────────────────────────────
// GL-Service configuration. Endpoints and field names come from the GrainLink
// OpenAPI schema (Grainlink API 1.0.0). Edit thresholds and the kit list here.
// ─────────────────────────────────────────────────────────────────────────────
window.GL_CONFIG = {
  // Used when the page calls the API straight from the browser (e.g. on GitHub
  // Pages). When running server.js, the server's env vars are used instead.
  api: {
    base: "https://api.grainlink.com",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
  },

  // Lists to load. Every list is paginated ({count, next, results}); the app
  // follows `next` until it has everything.
  endpoints: {
    user: "/api/users/current/",
    accounts: "/api/accounts/",
    locations: "/api/locations/",
    silos: "/api/silos/",
    chesters: "/api/chesters/",
    sensors: "/api/sensors/",
    cables: "/api/cables/",
    alarms: "/api/alarms/",
  },
  pageSize: 500,
  // Bin sizes (diameter, eave and peak height) are only on the bin detail
  // endpoint, so the app fetches /api/silos/{uuid}/ for each bin.
  loadBinDetails: true,

  // Sensor `status` values that mean the installer has something to fix, and
  // ones that only need a look.
  sensorFixStatuses: ["offline", "fault", "stale", "unseen"],
  sensorCheckStatuses: ["unstable"],
  // Alarms whose `state` matches this are treated as closed and left off the
  // work order.
  closedAlarmState: /resolv|clear|closed|inactive|normal|^ok$/i,
  // Flag a Chester gateway's backup battery at or below this voltage. null
  // turns the check off (the voltage is still shown on the work order).
  lowBackupVoltage: null,

  units: "ft",             // unit the API uses for bin diameter and heights
  // Bin diameter → number of temperature/moisture cables for a new install.
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
  roofPitchDeg: 30,        // used to estimate roof rise when peak height is missing
  cableSlackFt: 3,         // extra length for hanging hardware
  cableRoundToFt: 5,       // round cable lengths up to this increment
  defaultDiameterFt: 30,   // used when the API doesn't have a bin's diameter
  defaultEaveHeightFt: 24, // used when the API doesn't have a bin's eave height

  // Kit list. `qty` is multiplied by the count of `per`:
  //   job, gateway (new install), bin (new install), cable (new install),
  //   offlineGateway, lowBattery, faultyCable (cable with dead sensors).
  // `jobs` lists the job types the item applies to.
  supplies: [
    { item: "Chester gateway + LTE antenna", per: "gateway", qty: 1, jobs: ["install"] },
    { item: "Solar panel + mounting bracket", per: "gateway", qty: 1, jobs: ["install"] },
    { item: "Spare Chester gateway (swap unit)", per: "offlineGateway", qty: 1, jobs: ["service"] },
    { item: "Chester backup battery pack", per: "lowBattery", qty: 1, jobs: ["service", "install"] },
    { item: "Spare sensor cable connector kit", per: "faultyCable", qty: 1, jobs: ["service"] },
    { item: "Cable roof-hanger bracket", per: "cable", qty: 1, jobs: ["install"] },
    { item: "Cable anchor / weight", per: "cable", qty: 1, jobs: ["install"] },
    { item: "Roof cap / weather seal", per: "cable", qty: 1, jobs: ["install"] },
    { item: "Self-tapping roof screws (box)", per: "bin", qty: 1, jobs: ["install"] },
    { item: "Silicone sealant tube", per: "bin", qty: 1, jobs: ["install"] },
    { item: "UV zip ties (bag)", per: "job", qty: 1, jobs: ["install", "service"] },
    { item: "Harness + fall-protection lanyard", per: "job", qty: 1, jobs: ["install", "service", "inspection"] },
    { item: "Drill/driver + bits, step bit", per: "job", qty: 1, jobs: ["install", "service"] },
    { item: "Multimeter", per: "job", qty: 1, jobs: ["install", "service", "inspection"] },
    { item: "Phone/tablet with GrainLink app logged in", per: "job", qty: 1, jobs: ["install", "service", "inspection"] },
  ],
};
