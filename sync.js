const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// ================= ENV =================
const umbrellaKey = process.env.UMBRELLA_KEY;

// ================= FILE OPS =================
function saveDomains(domains) {
  // Set kullanarak benzersiz domainleri al
  const uniqueDomains = [...new Set(domains)];

  try {
    fs.writeFileSync(OUTPUT_FILE, uniqueDomains.join("\n"), "utf8");
    console.log(
      `\n${uniqueDomains.length} unique domain saved to ${OUTPUT_FILE}`,
    );
  } catch (err) {
    console.error("Failed to save domains file:", err);
  }
}

function loadDomains() {
  if (!fs.existsSync(OUTPUT_FILE)) return [];
  const data = fs.readFileSync(OUTPUT_FILE, "utf-8");
  return data.split(/\r?\n/).filter((line) => line.trim() !== "");
}

// ================= CONFIG =================
// Using path.join(__dirname) ensures files are always found in the script's directory
const BASE_URL = "https://siberguvenlik.gov.tr/api/address/index";
const STATE_FILE = path.join(__dirname, "state.json");
const OUTPUT_FILE = path.join(__dirname, "domains.txt");

const ENABLE_UMBRELLA = true;
const UMBRELLA_URL = `https://s-platform.api.opendns.com/1.0/events?customerKey=${umbrellaKey}`;

if (ENABLE_UMBRELLA && !umbrellaKey) {
  console.error(
    "Error: ENABLE_UMBRELLA is true, but UMBRELLA_KEY is missing in your .env file!",
  );
  process.exit(1);
}

const PAGE_SIZE = 9999;
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
  const filled =
    total > 0 ? Math.round((barLength * current) / total) : barLength;
  const bar = "█".repeat(filled) + "-".repeat(barLength - filled);
  process.stdout.write(
    `\r${label.padEnd(12)} [${bar}] ${percent}% (${current}/${total})`.padEnd(
      60,
    ),
  );
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

function toDate(str) {
  return new Date(str.replace(" ", "T"));
}

// ================= API =================
async function fetchPage(page, lastRun) {
  const params = { type: "domain", page, "per-page": PAGE_SIZE };
  if (lastRun) params["date_gte"] = lastRun;
  return axios.get(BASE_URL, { params, timeout: 30000 });
}

// ================= UMBRELLA =================
async function sendBatchToUmbrella(domains, attempt = 0) {
  if (!ENABLE_UMBRELLA) return;

  // 1. Kendi iç Rate Limiting Kontrolümüz (Soft Limit)
  if (Date.now() - lastReset > 60000) {
    domainsSentThisMinute = 0;
    lastReset = Date.now();
  }

  if (domainsSentThisMinute + domains.length > MAX_DOMAINS_PER_MIN) {
    const waitTime = 60000 - (Date.now() - lastReset);
    console.log(`Soft limit reached, waiting ${Math.round(waitTime/1000)}s...`);
    await sleep(waitTime);
    return sendBatchToUmbrella(domains, attempt);
  }

  // Event yapısını oluştur
  const events = domains.map((d) => ({
    alertTime: new Date().toISOString().split(".")[0] + "Z",
    eventTime: new Date().toISOString().split(".")[0] + "Z",
    deviceId: "siberguvenlik-sync-agent",
    deviceVersion: "1.0",
    dstDomain: d,
    dstUrl: `http://${d}/`,
    protocolVersion: "1.0a",
    providerName: "Security Platform",
  }));

  try {
    await axios.post(UMBRELLA_URL, events, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    });
    
    // Başarılı ise sayacı güncelle
    domainsSentThisMinute += domains.length;
  } catch (err) {
    if (err.response?.status === 429) {
      const retryAfterHeader = err.response.headers['retry-after'];
      
      const delay = retryAfterHeader 
        ? parseInt(retryAfterHeader) * 1000 
        : Math.min(5000 * Math.pow(2, attempt), 60000);

      console.warn(`[429] Rate limited. Retrying in ${Math.round(delay/1000)}s... (Attempt ${attempt + 1})`);
      
      await sleep(delay);
      return sendBatchToUmbrella(domains, attempt + 1);
    }
    
    // 429 dışındaki hataları fırlat
    console.error(`[Error] Request failed with status ${err.response?.status}:`, err.message);
    throw err;
  }
}

// ================= MAIN =================
async function run() {
  const args = process.argv.slice(2);
  const skipFetch = args.includes("--skip-fetch");

  let allItems = [];
  const state = loadState();

  // 1. FETCH PHASE
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
    const firstPageRes = await fetchPage(0, state.lastRun);
    const totalPages = firstPageRes.data?.pageCount || 0;

    console.log(`Detected ${totalPages} total pages to fetch.`);
    allItems.push(...(firstPageRes.data?.models || []));
    renderProgress(1, totalPages, "Fetching");

    for (let page = 1; page < totalPages; page++) {
      const res = await fetchPage(page, state.lastRun);
      allItems.push(...(res.data?.models || []));
      renderProgress(page + 1, totalPages, "Fetching");
      await sleep(1200);
    }
  }

  if (allItems.length === 0) {
    console.log("\nNo new items to process.");
    return;
  }

  // 2. DEDUPLICATION & BATCH PREP
  const existingDomains = loadDomains();
  const uniqueNewDomains = [...new Set(allItems.map(item => item.url))];
  const domainsToUpload = uniqueNewDomains.filter(d => !existingDomains.includes(d));

  // 3. UPLOAD PHASE (Atomic)
  console.log(`\n--- Starting Batch/Upload Phase (${domainsToUpload.length} new items) ---`);
  
  try {
    const chunkArray = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
    const batches = chunkArray(domainsToUpload, BATCH_SIZE);

    for (let i = 0; i < batches.length; i++) {
      await sendBatchToUmbrella(batches[i]);
      renderProgress(i + 1, batches.length, "Uploading");
    }

    // UPDATE STATE ONLY AFTER SUCCESSFUL UPLOAD
    const maxDate = allItems.reduce((max, item) => 
      (toDate(item.date) > new Date(max || 0) ? item.date : max), state.lastRun);
    
    // Save updated domains list and state
    saveDomains([...existingDomains, ...domainsToUpload]);
    saveState({ lastRun: maxDate });
    
    console.log("\n--- Success! State updated to:", maxDate, "---");
  } catch (err) {
    console.error("\n!!! CRITICAL ERROR during Upload. State NOT updated to prevent data loss. !!!");
    throw err; // Re-throw to let the process exit with failure
  }
}

run().catch(console.error);
