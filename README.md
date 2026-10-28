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

1. With `npm start`, the browser sends the key to the local server (`server.js`), which forwards it to `api.grainlink.com` and so avoids CORS errors. On a static host, the page calls the API itself, using `api` in `public/config.js`. The key is never stored.
2. The app loads the customer's account, sites, bins and devices, and works out:
   - **New install:** the bins with no transmitter, how many cables each one needs (by diameter), the cable lengths (eave height + roof rise + slack), and whether the site needs a hub.
   - **Service call:** offline devices and low batteries, with swap units and battery packs added to the supply list.
   - **Inspection:** a task to check each bin.
3. Copy buttons give you:
   - **Title:** paste it as a new Trello card.
   - **Card description:** Trello markdown for the card's description.
   - **Task checklist / Supply checklist:** paste each into a Trello checklist. Trello makes each line its own item.

## Configure it: `public/config.js`

| Setting | What it controls |
|---|---|
| `endpoints` | The API paths to try for account, sites, bins and devices |
| `fields` | Field-name aliases, so the app can read whatever names the API uses |
| `cableRules`, `roofPitchDeg`, `cableSlackFt` | How many cables each bin needs and how long they are |
| `supplies` | The kit list: each item's quantity per job, site, bin, cable or device issue |

These environment variables set how the server calls the API:

| Variable | Default |
|---|---|
| `GRAINLINK_API_BASE` | `https://api.grainlink.com` |
| `GRAINLINK_AUTH_HEADER` | `Authorization` (use `x-api-key` if the API expects that) |
| `GRAINLINK_AUTH_PREFIX` | `Bearer ` (set to empty when using `x-api-key`) |
| `PORT` | `3000` |
