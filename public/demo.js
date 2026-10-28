// Sample data shaped like real GrainLink API responses (see config.js), used by
// "Try demo data" so the app can be tried without a token. Not a real farm.
(() => {
  const ago = (hours) => new Date(Date.now() - hours * 36e5).toISOString();
  const loc = { home: { uuid: "loc-home", name: "Home Yard" }, north: { uuid: "loc-north", name: "North Quarter" } };

  const sensors = [];
  const addCable = (cable, chester, count, problems = {}) => {
    for (let p = 1; p <= count; p++) {
      const status = problems[p] || "stable";
      sensors.push({
        uuid: `${cable}-s${p}`, name: `S${p}`, serial_number: `${cable.toUpperCase()}-${p}`,
        temperature: 9.5, humidity: 61, moisture: 13.2, status, position: p,
        chester, sensor_cable: cable, last_seen: status === "stable" ? ago(0.3) : ago(52),
      });
    }
  };
  addCable("cab-1a", "ch-home", 8);
  addCable("cab-2a", "ch-home", 9, { 4: "offline", 5: "offline" });
  addCable("cab-2b", "ch-home", 9);
  addCable("cab-2c", "ch-home", 9, { 7: "unstable" });
  addCable("cab-3a", "ch-north", 9, { 1: "offline", 2: "offline", 3: "offline", 4: "offline", 5: "offline", 6: "offline", 7: "offline", 8: "offline", 9: "offline" });

  window.GL_DEMO = {
    user: { id: 125, first_name: "Dale", last_name: "Hendricks", phone: "(306) 555-0182", email: "dale@prairieridge.example", accounts: [1042] },
    accounts: [{ id: 1042, uuid: "acc-1042", name: "Prairie Ridge Farms" }],
    locations: [
      { uuid: "loc-home", name: "Home Yard", account: "acc-1042", latitude: 51.556, longitude: -107.991, address: "Rural Route 2", city_name: "Rosetown, SK", silo_count: 3, chester_count: 1, alarm_count: 1 },
      { uuid: "loc-north", name: "North Quarter", account: "acc-1042", latitude: 51.612, longitude: -107.954, address: "Twp Rd 312", city_name: "Rosetown, SK", silo_count: 2, chester_count: 1, alarm_count: 2 },
    ],
    silos: [
      { uuid: "silo-1", name: "Bin 1", location: loc.home, location_name: "Home Yard", grain_type: { name: "Canola" }, capacity: 14500, level: 72, sensors_count: 8, online_sensors_count: 8, diameter: 30, eave_height: 24, peak_height: 32 },
      { uuid: "silo-2", name: "Bin 2", location: loc.home, location_name: "Home Yard", grain_type: { name: "Wheat" }, capacity: 22000, level: 55, sensors_count: 27, online_sensors_count: 25, diameter: 36, eave_height: 27, peak_height: 37 },
      { uuid: "silo-3", name: "Bin 3", location: loc.home, location_name: "Home Yard", grain_type: { name: "Wheat" }, capacity: 22000, level: 0, sensors_count: 0, online_sensors_count: 0, diameter: 36, eave_height: 27, peak_height: 37 },
      { uuid: "silo-4", name: "Hopper 4", location: loc.north, location_name: "North Quarter", grain_type: { name: "Barley" }, capacity: 8000, level: 90, sensors_count: 9, online_sensors_count: 0, diameter: 24, eave_height: 20, peak_height: 27 },
      { uuid: "silo-5", name: "Big Flat 5", location: loc.north, location_name: "North Quarter", grain_type: null, capacity: 52000, level: 0, sensors_count: 0, online_sensors_count: 0, diameter: 48, eave_height: 32, peak_height: 46 },
    ],
    cables: [
      { uuid: "cab-1a", name: "Center", silo: "silo-1" },
      { uuid: "cab-2a", name: "A", silo: "silo-2" },
      { uuid: "cab-2b", name: "B", silo: "silo-2" },
      { uuid: "cab-2c", name: "C", silo: "silo-2" },
      { uuid: "cab-3a", name: "Center", silo: "silo-4" },
    ],
    chesters: [
      { uuid: "ch-home", name: "Home Yard Chester", serial_number: "2159018440", backup_voltage: 3.6, sensor_count: 35, online_sensor_count: 33, last_seen: ago(0.2), location_name: loc.home, is_online: true, active_alarms_count: "1", chester_severity: "warning" },
      { uuid: "ch-north", name: "North Chester", serial_number: "2159018512", backup_voltage: 2.9, sensor_count: 9, online_sensor_count: 0, last_seen: ago(52), location_name: loc.north, is_online: false, active_alarms_count: "2", chester_severity: "critical" },
    ],
    sensors,
    alarms: [
      { uuid: "al-1", name: "Chester offline", source: "chester", severity: "critical", state: "active", count: 1, description: "No data received for 48 hours", chester_uuid: "ch-north", chester_name: "North Chester", chester_serial_number: "2159018512", created_at: ago(50), updated_at: ago(1) },
      { uuid: "al-2", name: "Sensors offline", source: "sensor", severity: "warning", state: "active", count: 2, description: "2 sensors on Bin 2 cable A not reporting", chester_uuid: "ch-home", chester_name: "Home Yard Chester", chester_serial_number: "2159018440", created_at: ago(30), updated_at: ago(2) },
      { uuid: "al-3", name: "High temperature", source: "silo", severity: "warning", state: "resolved", count: 1, description: "Bin 1 cleared", chester_uuid: "ch-home", chester_name: "Home Yard Chester", chester_serial_number: "2159018440", created_at: ago(200), updated_at: ago(150) },
    ],
  };
})();
