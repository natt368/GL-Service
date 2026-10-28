// Sample data used by "Try demo data" so the app can be tried without an API key.
window.GL_DEMO = {
  account: {
    id: "cus_1042",
    company_name: "Prairie Ridge Farms",
    contact_name: "Dale Hendricks",
    phone: "(306) 555-0182",
    email: "dale@prairieridge.example",
  },
  sites: [
    { id: "site_a", name: "Home Yard", address: "Rural Route 2", city: "Rosetown", state: "SK", lat: 51.556, lng: -107.991 },
    { id: "site_b", name: "North Quarter", address: "Twp Rd 312", city: "Rosetown", state: "SK", lat: 51.612, lng: -107.954 },
  ],
  bins: [
    { id: "bin_1", site_id: "site_a", name: "Bin 1", diameter_ft: 30, eave_height_ft: 24, capacity_bu: 14500, commodity: "Canola" },
    { id: "bin_2", site_id: "site_a", name: "Bin 2", diameter_ft: 36, eave_height_ft: 27, capacity_bu: 22000, commodity: "Wheat" },
    { id: "bin_3", site_id: "site_a", name: "Bin 3", diameter_ft: 36, eave_height_ft: 27, capacity_bu: 22000, commodity: "Wheat" },
    { id: "bin_4", site_id: "site_b", name: "Hopper 4", diameter_ft: 24, eave_height_ft: 20, capacity_bu: 8000, commodity: "Barley" },
    { id: "bin_5", site_id: "site_b", name: "Big Flat 5", diameter_ft: 48, eave_height_ft: 32, capacity_bu: 52000 },
  ],
  devices: [
    { serial: "GLH-00871", type: "hub", site_id: "site_a", status: "online", battery: 96, last_seen: "__recent__" },
    { serial: "GLN-11402", type: "node", bin_id: "bin_1", site_id: "site_a", status: "online", battery: 81, last_seen: "__recent__" },
    { serial: "GLN-11403", type: "node", bin_id: "bin_2", site_id: "site_a", status: "online", battery: 14, last_seen: "__recent__" },
    { serial: "GLN-11404", type: "node", bin_id: "bin_3", site_id: "site_a", status: "offline", battery: 55, last_seen: "__stale__" },
  ],
};
