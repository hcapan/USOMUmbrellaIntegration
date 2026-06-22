const axios = require("axios");
const fs = require("fs");
const path = require("path");

// ================= CONFIG =================
// Using path.join(__dirname) ensures files are always found in the script's directory
const BASE_URL = "https://siberguvenlik.gov.tr/api/address/index";
const STATE_FILE = path.join(__dirname, "state.json");
const OUTPUT_FILE = path.join(__dirname, "domains.txt");
const CACHE_FILE = path.join(__dirname, "cache.json");

const ENABLE_UMBRELLA = true;
const UMBRELLA_URL = "https://s-platform.api.opendns.com/1.0/events?customerKey=cbbd223a-e594-4b78-8462-52845de9cb6f";

const PAGE_SIZE = 9999;
const TOTAL_PAGES = 46;
const BATCH_SIZE = 200;

// ================= UMBRELLA RATE LIMIT CONFIG =================
const MAX_DOMAINS_PER_MIN = 200;
let domainsSentThisMinute = 0;
let lastReset = Date.now();

// ================= UTIL =================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function renderProgress(current, total, label = "") {
  const percent = total > 0 ? ((current / total) * 100).toFixed(2) : "100.00";
  const barLength = 30;
  const filled = total > 0 ? Math.round((barLength * current) / total) : barLength;
  const bar = "█".repeat(filled) + "-".repeat(barLength - filled);
  process.stdout.write(`\r${label.padEnd(12)} [${bar}] ${percent}% (${current}/${total})`.padEnd(60));
}

// ================= STATE & DATE =================
function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return { lastRun: null };
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch (err) {
    console.warn("Could not read state file, starting fresh.");
    return { lastRun: null };
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
    console.log("\nState saved successfully.");
  } catch (err) {
    console.error("Failed to save state file:", err);
  }
}

function toDate(str) { return new Date(str.replace(" ", "T")); }

// ================= API =================
async function fetchPage(page, lastRun) {
  const params = { type: "domain", page, "per-page": PAGE_SIZE };
  if (lastRun) params["date_gte"] = lastRun;
  return axios.get(BASE_URL, { params, timeout: 30000 });
}

// ================= UMBRELLA =================
async function sendBatchToUmbrella(domains) {
  if (!ENABLE_UMBRELLA) return;

  // Rate Limiting Enforcement
  if (Date.now() - lastReset > 60000) {
    domainsSentThisMinute = 0;
    lastReset = Date.now();
  }

  if (domainsSentThisMinute + domains.length > MAX_DOMAINS_PER_MIN) {
    const waitTime = 60000 - (Date.now() - lastReset);
    await sleep(waitTime);
    return sendBatchToUmbrella(domains);
  }

  const events = domains.map((d) => ({
    alertTime: new Date().toISOString().split('.')[0] + 'Z',
    eventTime: new Date().toISOString().split('.')[0] + 'Z',
    deviceId: "siberguvenlik-sync-agent",
    deviceVersion: "1.0",
    dstDomain: d,
    dstUrl: `http://${d}/`,
    protocolVersion: "1.0a",
    providerName: "Security Platform"
  }));

  try {
    await axios.post(UMBRELLA_URL, events, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    });
    domainsSentThisMinute += domains.length;
  } catch (err) {
    if (err.response?.status === 429) {
      await sleep(5000);
      return sendBatchToUmbrella(domains);
    }
    throw err; // Allow main loop to handle severe errors
  }
}

// ================= MAIN =================
async function run() {
  const args = process.argv.slice(2);
  const skipFetch = args.includes("--skip-fetch");

  let allItems = [];
  const state = loadState();

  if (skipFetch) {
    console.log("--- Loading from domains.txt ---");
    if (fs.existsSync(OUTPUT_FILE)) {
      const data = fs.readFileSync(OUTPUT_FILE, "utf-8");
      allItems = data.split(/\r?\n/).filter(line => line.trim() !== "").map(url => ({ url }));
    } else {
      throw new Error("domains.txt not found!");
    }
  } else {
    console.log("--- Starting Fetch Phase ---");
    for (let page = 0; page < TOTAL_PAGES; page++) {
      const res = await fetchPage(page, state.lastRun);
      const items = res.data?.models || [];
      allItems.push(...items);
      renderProgress(page + 1, TOTAL_PAGES, "Fetching");
      await sleep(1200);
    }
    
    // Save to file
    const stream = fs.createWriteStream(OUTPUT_FILE, { flags: "a" });
    allItems.forEach(item => stream.write(item.url + "\n"));
    stream.end();
    
    // Update State IMMEDIATELY after fetch success
    if (allItems.length > 0) {
      const maxDate = allItems.reduce((max, item) => 
        (toDate(item.date) > new Date(max || 0) ? item.date : max), state.lastRun);
      saveState({ lastRun: maxDate });
      console.log("\n--- Fetching Complete. State updated to:", maxDate, "---");
    } else {
      console.log("\n--- Fetching Complete. No new items found. ---");
    }
  }

  if (allItems.length === 0) {
    console.log("No new items to process.");
    return;
  }

  // BATCH PHASE
  console.log(`--- Starting Batch/Upload Phase (${allItems.length} items) ---`);
  const chunkArray = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
  const batches = chunkArray(allItems, BATCH_SIZE);

  for (let i = 0; i < batches.length; i++) {
    const domains = batches[i].map((x) => x.url);
    await sendBatchToUmbrella(domains);
    renderProgress(i + 1, batches.length, "Uploading");
  }

  console.log("\nDONE.");
}

run().catch(console.error);