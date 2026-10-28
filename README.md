# GL-Service: GrainLink Work Orders

Enter a GrainLink customer's API key and get an installer work order and a supply list, ready to paste into Trello.

## Run it

Needs Node 18 or newer. There are no dependencies to install.

```bash
npm start
```

Then open http://localhost:3000. Click **Try demo data** to see it without an API key.

## Live site (GitHub Pages)

https://natt368.github.io/GL-Service/

`.github/workflows/pages.yml` publishes `public/` on every push. On Pages there is no server, so the page calls api.grainlink.com straight from the browser. That works only if the API allows cross-origin (CORS) requests from `natt368.github.io`. If it doesn't, use `npm start`, or paste the API's JSON into the **Or paste API data** box.

## How it works

1. In the GrainLink dashboard, open **API Access** and copy the customer's **JWT token**. Tokens expire after 2 hours.
2. Paste it into the app and click **Load customer**. The token is sent as `Authorization: Bearer <token>` and is never stored. With `npm start` the request goes through the local proxy (`server.js`). On GitHub Pages the browser calls api.grainlink.com directly.
3. The app loads these endpoints from the GrainLink API (following pagination):

   | Endpoint | Used for |
   |---|---|
   | `/api/users/current/` | Customer contact name, phone, email |
   | `/api/accounts/` | Account name (and an account picker if the token sees several) |
   | `/api/locations/` | Sites, addresses, map links |
   | `/api/silos/` and `/api/silos/{uuid}/` | Bins, grain, sensor counts, diameter, eave and peak height |
   | `/api/cables/` | Sensor cables in each bin |
   | `/api/sensors/` | Sensor `status` (offline, fault, stale, unseen, unstable) |
   | `/api/chesters/` | Gateways: online state, last seen, backup voltage |
   | `/api/alarms/` | Active alarms and their severity |

4. It picks the job type from what it finds:
   - **Service call** (if anything is wrong): offline Chester gateways, cables with sensors that aren't reporting, unstable sensors and active alarms. Sensors behind an offline gateway are folded into that gateway's task.
   - **New install** (if bins have no sensors): cable count from the bin's diameter, cable length from its peak height, and a Chester for sites that don't have one.
   - **Inspection**: a check task for every gateway and monitored bin.
5. Copy buttons give you:
   - **Title:** paste it as a new Trello card.
   - **Card description:** Trello markdown for the card's description.
   - **Task checklist / Supply checklist:** paste each into a Trello checklist. Trello makes each line its own item.

## Configure it: `public/config.js`

| Setting | What it controls |
|---|---|
| `endpoints`, `pageSize`, `loadBinDetails` | Which GrainLink endpoints are loaded |
| `sensorFixStatuses`, `sensorCheckStatuses` | Which sensor statuses count as broken or worth a look |
| `closedAlarmState` | Which alarm states are left off the work order |
| `lowBackupVoltage` | Flag Chester backup batteries at or below this voltage (off by default) |
| `units`, `cableRules`, `cableSlackFt` | Bin units, cables per bin diameter, and cable length |
| `supplies` | The kit list: each item's quantity per job, gateway, bin, cable, offline gateway or faulty cable |

These environment variables set how the server calls the API:

| Variable | Default |
|---|---|
| `GRAINLINK_API_BASE` | `https://api.grainlink.com` |
| `GRAINLINK_AUTH_HEADER` | `Authorization` (use `x-api-key` if the API expects that) |
| `GRAINLINK_AUTH_PREFIX` | `Bearer ` (set to empty when using `x-api-key`) |
| `PORT` | `3000` |
