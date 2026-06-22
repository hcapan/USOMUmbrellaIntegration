# Sibergüvenlik to Cisco Umbrella Sync Agent

A lightweight, automated integration tool that synchronizes threat intelligence domain feeds from [Sibergüvenlik](https://siberguvenlik.gov.tr/) into Cisco Umbrella. 

## Features
- **Delta Sync:** Uses `date_gte` to fetch only new indicators since the last successful run.
- **Rate-Limited Uploads:** Automatically adheres to Cisco Umbrella's API limits (200 domains per minute).
- **Fault-Tolerant:** Decouples fetching from uploading. If the upload fails, you can resume without re-fetching data.
- **Persistence:** Maintains state via `state.json` and local logs via `domains.txt`.

## Prerequisites
- [Node.js](https://nodejs.org/) (v16+)
- `axios` package

Install dependencies:
```bash
npm install axios