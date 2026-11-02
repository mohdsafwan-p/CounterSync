# CounterSync — Smart Counters. Seamless Sales.

> **Tagline:** Smart Counters. Seamless Sales.  
> **Brand Identity:** Electric Blue (`#0066FF`), Deep Onyx (`#0B132B`), Pure Surfaces & Dark AMOLED (`#050811`, `#000000`).

---

## ⚡ Executive Overview

**CounterSync** is a high-performance, offline-first Event POS, Stock Warehouse Management, and Multi-Tenant Sales Synchronization platform engineered specifically for book launches, literary festivals, concerts, and crowded stadium pop-up stalls.

It eliminates long queues, overselling, lost physical cash, and stock reconciliation discrepancies by introducing **real-time peer transfers**, **two-way stock handshake dispatches**, **dynamic on-screen UPI QR billing**, **PIN-protected voiding**, and a **6-column balanced inventory audit matrix**.

---

## 🏗️ Architecture & Core Components

```
CounterSync/
├── index.html          # Unified SPA Gateway, POS View, Warehouse View & Admin Dashboard
├── manifest.json       # PWA Manifest for Standalone Android/iOS/Desktop installation
├── sw.js               # Service Worker for 100% Offline field resilience
├── css/
│   └── style.css       # Bulletproof, zero-CDN, responsive AMOLED Dark & Light CSS
├── js/
│   ├── qrcode.js       # Pure standalone offline QR code matrix engine (Zero-CDN)
│   ├── seed.js         # Default festival seed data for active event CS2026
│   ├── store.js        # Local-first reactive state store with cross-tab sync
│   └── app.js          # Unified controller, POS billing engine, audio synthesis & timers
└── icons/
    ├── logo.png        # Official high-resolution CounterSync brand logo
    ├── icon-512.png    # 512x512 PWA App Icon
    ├── icon-192.png    # 192x192 PWA Mobile Icon
    └── icon.svg        # CS vector emblem & logo
```

---

## 🚀 Quick Start & Field Deployment

### 1. Direct Browser Execution
Open `index.html` directly in any modern browser (Chrome, Edge, Safari, Firefox). No backend server or build step required!

### 2. Default Access Keys & Demo Credentials
- **Active Event Access Key:** `CS2026` *(Bangalore Literary Festival 2026 Launch)*
- **Super Admin Master PIN:** `9999`
- **Stock Room Warehouse PIN:** `5555`
- **Counter 01A PIN:** `1101` (Volunteers: Rahul Sharma & Priya Nair)
- **Counter 01B PIN:** `1102` (Volunteers: Sneha Rao & Amit Patel)
- **Counter 02A PIN:** `1201` (Volunteers: Rohan Varma & Ananya Iyer)
- **Counter 02B PIN:** `1202` (Volunteers: Karthik Menon & Divya Sen)

### 3. Stealth URL Routing for Field Auditors
Append `?portal=master` to the application URL to directly access the Organizer & Super Admin portal:
```
index.html?portal=master
```

---

## 📖 Feature Guide & Operational Workflows

### 1. Unified Gateway & Multi-Tenant Access
- **Clutter-Free Landing Screen:** The top navigation bar auto-hides on the brand welcome screen.
- **Join Event (Staff Path):** Prompts for the 6–8 character event key (`CS2026`). Once verified, dynamically reveals only counters and warehouse assigned to that event.
- **Scoped Counter Picker:** Counter staff click their assigned desk and authenticate using their 4-digit PIN.
- **Host an Event (Organizer Path):** Connects to Google Sign-In or bypasses with the Master Field PIN (`9999`).

### 2. Sales Counter Workspace (Staff / POS View)
- **Live Status Header Card:** Shows assigned volunteer names and connectivity status.
- **HERO Oversized Stock Indicator:** Big-digit display of shelf copies. **Automatically switches to bold red with warning pulses when stock drops to $\le 10$**.
- **Real-Time Triple KPIs:** Tracks Sold Copies (regular + VIP breakdown), Remaining Copies, and Net Collections (Cash + UPI).
- **Two-Way Stock Dispatch Banner:** When copies are in transit from the central warehouse, an alert banner appears with a **1-tap "Accept Stock" handshake** that securely adds inventory to the counter once verified.
- **Rapid Rush-Hour Billing Engine:** Tap targets for `+1`, `+2`, `+5`, `+10`, or custom steppers.
- **Payment Mode Segregation:**
  - **CASH:** Triggers the double-tap prevention Fast Sale Confirmation Dialog.
  - **GPAY / UPI:** Generates a real-time, offline, dynamic UPI QR code encoded with the exact bill amount and the specific counter's UPI ID (`upi://pay?pa=...&am=...`).
- **VIP & Complimentary Handover:** Zero-rupee handover logging dignitary names and designations (e.g. Chief Guest, Panel Chair) for official audits.
- **Inter-Counter Peer-to-Peer Transfer:** Balance book shortages between neighboring counters instantly without waiting for warehouse dispatches.
- **Pre-Order Fulfillment:** Search attendee reservations by token (e.g., `EVT-26-0101`), customer name, or phone. Handles *Already Paid* and *Pay on Pickup*.
- **Shift Closing & Cash Reconciliation:** Note denomination calculator for ₹500, ₹200, ₹100, ₹50, ₹20, and ₹10 notes. Compares physical currency with logged sales, giving instant status:
  - `Exact Match ✓` (Emerald)
  - `Surplus +₹X` (Amber)
  - `Shortage -₹X` (Rose)
- **Security & Fraud Controls:** Cancel mistyped transactions with PIN-protected voiding (restores copies and deducts revenue). 3-minute inactivity auto-lock pauses workspace until unlocked.

### 3. Central Stock Room & Warehouse Management
- **Warehouse Dashboard:** Real-time visibility into Total Press Inflow, Remaining Vault Reserve, Distributed to Desks, and Complimentary Vault Total.
- **Dispatches with Handshake Safety:** Formulate batch dispatches to sales desks. Stock remains marked *IN_TRANSIT* until acknowledged by the destination counter.
- **Direct Vault Complimentary Issues:** Issues free copies straight from the stock vault with official recipient records.
- **Press Audit & Stock Correction:** Adjust print runs with mandatory reason codes: *Damaged Bundles*, *Physical Miscount*, or *Audit Adjustment*.
- **Low Stock Monitor:** Central alert feed showing counters whose stock has fallen below 10 copies, with a 1-tap emergency dispatch button.

### 4. Super Admin Executive Master Dashboard
- **Master Access Key Banner:** Displays active event key with a 1-tap clipboard copy button.
- **Multi-Day Date Filter:** Filter audits by *All Days (Grand Total)*, *Today Only*, or historical festival dates (`YYYY-MM-DD`). All KPIs recalculate dynamically.
- **6-Column Balanced Ledger Audit Matrix:**
  1. *Total Press Inflow*
  2. *Total Copies Sold*
  3. *Total VIP / Complimentary Copies*
  4. *Reserve in Central Stock Room*
  5. *Stock Active in Counters*
  6. *Grand Unsold Balance*
- **Financial KPI Tiles:** Total Gross Revenue, Cash in Hand across all desks, Digital GPay/UPI verified total, and Pre-Order Handover Tracker.
- **Live Counter Performance Table:** Audit breakdown of each counter's stock supplied, copies sold, free copies handed over, physical balance remaining, cash vs UPI breakdown, and net collection.
- **Context-Aware CSV Export:** Exports either the filtered day's closing register or the full master transaction log.
- **Live Configuration:** Add/edit counters, assign volunteers, customize UPI handles, adjust copy retail price, and update passwords.

### 5. Technical Highlights & Resilience
- **100% Offline Local-First:** Uses `localStorage` and `BroadcastChannel` for instantaneous multi-tab and multi-window synchronization.
- **Standalone QR Engine:** Pure JavaScript QR code generator renders crisp vector SVGs without external CDNs or network requests.
- **Synthesized Audio:** Built-in Web Audio API sound synthesizer delivers cash register chimes, handshake confirmations, and warning beeps with zero external MP3 assets.
- **AMOLED Dark Mode:** High-contrast palette designed to preserve mobile battery during nighttime festivals and reduce eye fatigue.

---

## 📚 Technical Documentation & Specifications

1. **[Design System & Style Guide](DESIGN_SYSTEM.md):** Complete typography (Plus Jakarta Sans, Manjari, JetBrains Mono), primary brand colors, semantic UI palettes, and AMOLED contrast hierarchy.
2. **[Counter Statistics & Mathematical Flow](COUNTER_STATISTICS.md):** Mathematical formulas for real-time stock balances, cash reconciliation difference equations, two-way dispatch handshakes, peer transfers, and grand ledger integrity.

---
*CounterSync — Smart Counters. Seamless Sales.*
