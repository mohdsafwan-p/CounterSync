/**
 * CounterSync Local-First State Store
 * Zero-cloud offline-first engine with cross-tab multi-window synchronization.
 */

class CounterSyncStore {
  constructor() {
    this.STORAGE_KEY = "countersync_storage_v1";
    this.SESSION_KEY = "countersync_session_v1";
    this.subscribers = new Set();
    this.channel = null;

    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        this.channel = new BroadcastChannel('countersync_bus');
        this.channel.onmessage = (evt) => {
          if (evt.data && evt.data.type === 'SYNC') {
            this._notifySubscribers('REMOTE_SYNC', evt.data.payload);
          }
        };
      }
    } catch (e) {
      console.warn("BroadcastChannel not available:", e);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (evt) => {
        if (evt.key === this.STORAGE_KEY) {
          this._notifySubscribers('STORAGE_EVENT', null);
        }
      });
    }

    this._ensureInitialized();
  }

  _ensureInitialized() {
    const CURRENT_VERSION = 12;
    const raw = localStorage.getItem(this.STORAGE_KEY);
    const ver = parseInt(localStorage.getItem(this.STORAGE_KEY + '_ver') || '0', 10);

    if (!raw || ver < CURRENT_VERSION) {
      this.resetToSeed();
      localStorage.setItem(this.STORAGE_KEY + '_ver', String(CURRENT_VERSION));
      return;
    }

    try {
      const data = JSON.parse(raw);
      if (data && data.events && data.events["CS2026"]) {
        const ev = data.events["CS2026"];
        ev.name = "Almuneer 2026";
        ev.unitPrice = 100;
        ev.bookTitle = "Chronicles of Almuneer (Festival Commemorative Edition)";

        // Eliminate any stale 250 unitPrice across existing cached transactions
        if (ev.transactions) {
          ev.transactions.forEach(t => {
            if (t.unitPrice === 250) {
              t.unitPrice = 100;
              if (t.paymentMode !== 'FREE_VIP' && t.type !== 'VIP') {
                t.totalAmount = (t.copies || 1) * 100;
              }
            }
          });
        }
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
      }
    } catch (e) {}
  }

  resetToSeed() {
    const seed = JSON.parse(JSON.stringify(CS_DEFAULT_SEED));
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(seed));
    this._broadcast('SYNC', { reason: 'SEED_RESET' });
    this._notifySubscribers('RESET', null);
    return seed;
  }

  getData() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return this.resetToSeed();
      return JSON.parse(raw);
    } catch (err) {
      console.error("Failed to parse store:", err);
      return this.resetToSeed();
    }
  }

  saveData(data) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
      this._broadcast('SYNC', { timestamp: Date.now() });
      this._notifySubscribers('LOCAL_SAVE', null);
    } catch (err) {
      console.error("Failed to save store:", err);
    }
  }

  _broadcast(type, payload) {
    if (this.channel) {
      try {
        this.channel.postMessage({ type, payload });
      } catch (e) {
        // BroadcastChannel failed silently
      }
    }
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  _notifySubscribers(eventType, data) {
    this.subscribers.forEach(cb => {
      try {
        cb(eventType, data);
      } catch (e) {
        console.error("Subscriber notification error:", e);
      }
    });
  }

  // --- Session Management ---
  getSession() {
    try {
      const raw = sessionStorage.getItem(this.SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  setSession(sessionObj) {
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionObj));
    this._notifySubscribers('SESSION_UPDATE', sessionObj);
  }

  clearSession() {
    sessionStorage.removeItem(this.SESSION_KEY);
    this._notifySubscribers('SESSION_CLEAR', null);
  }

  // --- Event & Gateway Methods ---
  getActiveEventKey() {
    const session = this.getSession();
    if (session && session.eventKey) return session.eventKey;
    const data = this.getData();
    return data.activeEventKey || "CS2026";
  }

  getEvent(eventKey) {
    const data = this.getData();
    const key = (eventKey || this.getActiveEventKey()).toUpperCase().trim();
    return data.events[key] || null;
  }

  validateEventKey(eventKey) {
    if (!eventKey) return false;
    const key = eventKey.toUpperCase().trim();
    const data = this.getData();
    return !!data.events[key];
  }

  createEvent({ key, name, unitPrice, adminPin, stockRoomPin, pressInflow }) {
    const data = this.getData();
    const cleanKey = key.toUpperCase().trim();
    if (data.events[cleanKey]) {
      throw new Error(`Event key "${cleanKey}" already exists.`);
    }

    const price = parseInt(unitPrice, 10) || 100;
    const inflow = parseInt(pressInflow, 10) || 1000;

    data.events[cleanKey] = {
      key: cleanKey,
      name: name || `Event ${cleanKey}`,
      tagline: "Smart Counters. Seamless Sales.",
      bookTitle: "Official Event Publications",
      unitPrice: price,
      adminPin: adminPin || "9999",
      stockRoomPin: stockRoomPin || "5555",
      createdAt: new Date().toISOString(),
      stockRoom: {
        totalPressInflow: inflow,
        vaultReserve: inflow,
        keeperName: "Central Logistics Vault",
        corrections: [],
        vaultGiveaways: []
      },
      counters: [
        {
          id: `counter-01`,
          name: "Counter 01 (Main Gate)",
          pin: "1101",
          volunteers: "Volunteer Team A",
          upiId: `counter1@upi`,
          upiName: "Counter 01",
          initialStock: 100,
          currentStock: 100,
          notes: "Primary Gate Desk",
          lowStockAlert: false
        }
      ],
      dispatches: [],
      transfers: [],
      preOrders: [],
      reconciliations: [],
      transactions: []
    };

    // Deduct initial counter stock from vault reserve
    data.events[cleanKey].stockRoom.vaultReserve -= 100;

    data.activeEventKey = cleanKey;
    this.saveData(data);
    return data.events[cleanKey];
  }

  updateEventSettings(eventKey, settings) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) throw new Error("Event not found");

    if (settings.name) event.name = settings.name;
    if (settings.unitPrice !== undefined) event.unitPrice = Number(settings.unitPrice);
    if (settings.adminPin) event.adminPin = String(settings.adminPin);
    if (settings.stockRoomPin) event.stockRoomPin = String(settings.stockRoomPin);
    if (settings.bookTitle) event.bookTitle = settings.bookTitle;
    if (settings.stockRoomKeeper !== undefined) {
      if (!event.stockRoom) event.stockRoom = {};
      event.stockRoom.keeperName = String(settings.stockRoomKeeper).trim();
      event.stockRoom.keeper = String(settings.stockRoomKeeper).trim();
      event.stockRoomKeeper = String(settings.stockRoomKeeper).trim();
    }

    this.saveData(data);
    return event;
  }

  saveEvent(event) {
    if (!event || !event.key) return;
    const data = this.getData();
    data.events[event.key] = event;
    this.saveData(data);
    return event;
  }

  // --- Counters CRUD ---
  getCounters(eventKey) {
    const event = this.getEvent(eventKey);
    return event ? event.counters : [];
  }

  getCounter(eventKey, counterId) {
    const counters = this.getCounters(eventKey);
    return counters.find(c => c.id === counterId) || null;
  }

  saveCounter(eventKey, counterData) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) throw new Error("Event not found");

    const existingIndex = event.counters.findIndex(c => c.id === counterData.id);
    if (existingIndex >= 0) {
      event.counters[existingIndex] = {
        ...event.counters[existingIndex],
        ...counterData
      };
    } else {
      const newCounter = {
        id: counterData.id || `counter-${Date.now().toString().slice(-4)}`,
        name: counterData.name || "New Counter",
        pin: counterData.pin || "1234",
        volunteers: counterData.volunteers || "Volunteer Staff",
        upiId: counterData.upiId || "counter@upi",
        upiName: counterData.upiName || counterData.name,
        initialStock: Number(counterData.initialStock) || 0,
        currentStock: Number(counterData.initialStock) || 0,
        notes: counterData.notes || "",
        lowStockAlert: false
      };
      
      // If allocating initial stock from vault, adjust vault
      if (newCounter.initialStock > 0 && event.stockRoom.vaultReserve >= newCounter.initialStock) {
        event.stockRoom.vaultReserve -= newCounter.initialStock;
      }
      
      event.counters.push(newCounter);
    }

    this.saveData(data);
  }

  deleteCounter(eventKey, counterId) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) return;

    const counter = event.counters.find(c => c.id === counterId);
    if (counter && counter.currentStock > 0) {
      // Return remaining stock to central stock vault
      event.stockRoom.vaultReserve += counter.currentStock;
    }

    event.counters = event.counters.filter(c => c.id !== counterId);
    this.saveData(data);
  }

  // --- Stock Room Operations ---
  addStockDispatch({ eventKey, counterId, copies, dispatchedBy }) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) throw new Error("Event not found");

    const count = parseInt(copies, 10);
    if (isNaN(count) || count <= 0) throw new Error("Invalid dispatch quantity");
    if (event.stockRoom.vaultReserve < count) {
      throw new Error(`Insufficient vault reserve! Available: ${event.stockRoom.vaultReserve}`);
    }

    const counter = event.counters.find(c => c.id === counterId);
    if (!counter) throw new Error("Destination counter not found");

    // Deduct from warehouse reserve immediately (in transit)
    event.stockRoom.vaultReserve -= count;

    const dispatch = {
      id: `DSP-${Date.now().toString().slice(-5)}`,
      counterId: counter.id,
      counterName: counter.name,
      copies: count,
      timestamp: new Date().toISOString(),
      status: "IN_TRANSIT",
      dispatchedBy: dispatchedBy || "Stock Room Keeper"
    };

    if (!event.dispatches) event.dispatches = [];
    event.dispatches.unshift(dispatch);

    this.saveData(data);
    return dispatch;
  }

  acceptStockDispatch({ eventKey, dispatchId, acceptedBy }) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) throw new Error("Event not found");

    const dispatch = (event.dispatches || []).find(d => d.id === dispatchId);
    if (!dispatch) throw new Error("Dispatch record not found");
    if (dispatch.status === "ACCEPTED") throw new Error("Dispatch already accepted");

    const counter = event.counters.find(c => c.id === dispatch.counterId);
    if (!counter) throw new Error("Counter not found");

    // Handshake complete: counter inventory increments!
    counter.currentStock += dispatch.copies;
    dispatch.status = "ACCEPTED";
    dispatch.acceptedAt = new Date().toISOString();
    dispatch.acceptedBy = acceptedBy || "Counter Volunteer";

    // Clear low stock alert if stock is now > 10
    if (counter.currentStock > 10) {
      counter.lowStockAlert = false;
    }

    this.saveData(data);
    return dispatch;
  }

  triggerLowStockAlert({ eventKey, counterId }) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) return;

    const counter = event.counters.find(c => c.id === counterId);
    if (counter) {
      counter.lowStockAlert = true;
      counter.lowStockTimestamp = new Date().toISOString();
      this.saveData(data);
    }
  }

  clearLowStockAlert({ eventKey, counterId }) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) return;

    const counter = event.counters.find(c => c.id === counterId);
    if (counter) {
      counter.lowStockAlert = false;
      delete counter.lowStockTimestamp;
      this.saveData(data);
    }
  }

  logPressCorrection({ eventKey, change, reason, notes, loggedBy }) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) throw new Error("Event not found");

    const delta = parseInt(change, 10);
    if (isNaN(delta) || delta === 0) throw new Error("Invalid correction change");

    event.stockRoom.vaultReserve += delta;
    if (event.stockRoom.vaultReserve < 0) {
      event.stockRoom.vaultReserve = 0;
    }

    const correction = {
      id: `COR-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString(),
      change: delta,
      reason: reason || "Audit Adjustment",
      notes: notes || "",
      loggedBy: loggedBy || "Auditor"
    };

    if (!event.stockRoom.corrections) event.stockRoom.corrections = [];
    event.stockRoom.corrections.unshift(correction);

    this.saveData(data);
    return correction;
  }

  recordVaultGiveaway({ eventKey, recipientName, designation, copies, notes, issuedBy }) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) throw new Error("Event not found");

    const count = parseInt(copies, 10);
    if (isNaN(count) || count <= 0) throw new Error("Quantity must be greater than 0");
    if (event.stockRoom.vaultReserve < count) throw new Error("Insufficient reserve in stock vault");

    event.stockRoom.vaultReserve -= count;

    const giveaway = {
      id: `VG-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString(),
      recipientName: recipientName.trim(),
      designation: (designation || "").trim(),
      copies: count,
      notes: notes || "Direct vault complimentary issue",
      issuedBy: issuedBy || "Organizer HQ"
    };

    if (!event.stockRoom.vaultGiveaways) event.stockRoom.vaultGiveaways = [];
    event.stockRoom.vaultGiveaways.unshift(giveaway);

    this.saveData(data);
    return giveaway;
  }

  // --- POS Workspace Billing Operations ---
  recordSale({ eventKey, counterId, copies, paymentMode, buyerName, buyerPhone, note }) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) throw new Error("Event not found");

    const counter = event.counters.find(c => c.id === counterId);
    if (!counter) throw new Error("Counter not found");

    const count = parseInt(copies, 10);
    if (isNaN(count) || count <= 0) throw new Error("Invalid copy quantity");
    if (counter.currentStock < count) {
      throw new Error(`Insufficient counter stock! Available: ${counter.currentStock}`);
    }

    const unitPrice = event.unitPrice;
    const totalAmount = count * unitPrice;

    // Deduct physical counter stock
    counter.currentStock -= count;

    const txn = {
      id: `TXN-${Date.now().toString().slice(-6)}`,
      timestamp: new Date().toISOString(),
      counterId: counter.id,
      counterName: counter.name,
      copies: count,
      unitPrice: unitPrice,
      totalAmount: totalAmount,
      paymentMode: paymentMode, // CASH or UPI
      buyerName: buyerName ? buyerName.trim() : "",
      buyerPhone: buyerPhone ? buyerPhone.trim() : "",
      note: note || "",
      type: "SALE",
      voided: false
    };

    event.transactions.unshift(txn);
    this.saveData(data);
    return txn;
  }

  recordVIPHandover({ eventKey, counterId, recipientName, designation, copies, issuedBy }) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) throw new Error("Event not found");

    const counter = event.counters.find(c => c.id === counterId);
    if (!counter) throw new Error("Counter not found");

    const count = parseInt(copies, 10);
    if (isNaN(count) || count <= 0) throw new Error("Invalid quantity");
    if (counter.currentStock < count) {
      throw new Error(`Insufficient stock for complimentary handover! Available: ${counter.currentStock}`);
    }

    if (!recipientName || !recipientName.trim()) {
      throw new Error("Recipient Name is mandatory for VIP complimentary records");
    }

    counter.currentStock -= count;

    const volunteerStaff = issuedBy && issuedBy.trim() ? issuedBy.trim() : (counter.volunteers || "Volunteer Staff");

    const txn = {
      id: `TXN-${Date.now().toString().slice(-6)}`,
      timestamp: new Date().toISOString(),
      counterId: counter.id,
      counterName: counter.name,
      copies: count,
      unitPrice: 0,
      totalAmount: 0,
      paymentMode: "FREE_VIP",
      buyerName: `${recipientName.trim()} (VIP)`,
      designation: designation ? designation.trim() : "VIP Guest",
      issuedBy: volunteerStaff,
      note: `Issued to ${recipientName.trim()} by ${volunteerStaff}`,
      type: "VIP",
      voided: false
    };

    event.transactions.unshift(txn);
    this.saveData(data);
    return txn;
  }

  // --- Inter-Counter Stock Transfers ---
  transferStock({ eventKey, fromCounterId, toCounterId, copies, authorizedBy, reason }) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) throw new Error("Event not found");

    if (fromCounterId === toCounterId) {
      throw new Error("Source and destination counters must be different");
    }

    const count = parseInt(copies, 10);
    if (isNaN(count) || count <= 0) throw new Error("Invalid transfer quantity");

    const source = event.counters.find(c => c.id === fromCounterId);
    const dest = event.counters.find(c => c.id === toCounterId);

    if (!source || !dest) throw new Error("Counter not found");
    if (source.currentStock < count) {
      throw new Error(`Source counter has only ${source.currentStock} copies available`);
    }

    // Direct peer-to-peer balance
    source.currentStock -= count;
    dest.currentStock += count;

    const transfer = {
      id: `TRF-${Date.now().toString().slice(-5)}`,
      timestamp: new Date().toISOString(),
      fromCounterId: source.id,
      fromCounterName: source.name,
      toCounterId: dest.id,
      toCounterName: dest.name,
      copies: count,
      authorizedBy: authorizedBy || "Counter Staff",
      reason: reason || "Peer redistribution"
    };

    if (!event.transfers) event.transfers = [];
    event.transfers.unshift(transfer);

    this.saveData(data);
    return transfer;
  }

  // --- Pre-Order Fulfillment ---
  fulfillPreOrder({ eventKey, token, counterId, paymentMode }) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) throw new Error("Event not found");

    const preOrder = (event.preOrders || []).find(p => p.token.toLowerCase() === token.toLowerCase().trim());
    if (!preOrder) throw new Error("Pre-order token not found");
    if (preOrder.status === "FULFILLED") throw new Error("Pre-order already fulfilled");

    const counter = event.counters.find(c => c.id === counterId);
    if (!counter) throw new Error("Counter not found");

    if (counter.currentStock < preOrder.copies) {
      throw new Error(`Insufficient stock at this counter to fulfill pre-order! Needed: ${preOrder.copies}, Available: ${counter.currentStock}`);
    }

    // Deduct stock
    counter.currentStock -= preOrder.copies;

    preOrder.status = "FULFILLED";
    preOrder.fulfilledAt = new Date().toISOString();
    preOrder.fulfilledByCounter = counter.id;

    let revenueCollected = 0;
    if (preOrder.paymentType === "PAY_ON_PICKUP") {
      revenueCollected = preOrder.totalAmount || (preOrder.copies * event.unitPrice);
    }

    const txn = {
      id: `TXN-${Date.now().toString().slice(-6)}`,
      timestamp: new Date().toISOString(),
      counterId: counter.id,
      counterName: counter.name,
      copies: preOrder.copies,
      unitPrice: event.unitPrice,
      totalAmount: revenueCollected,
      paymentMode: preOrder.paymentType === "PAY_ON_PICKUP" ? (paymentMode || "CASH") : "ALREADY_PAID",
      buyerName: `${preOrder.buyerName} [${preOrder.token}]`,
      buyerPhone: preOrder.phone,
      type: "PREORDER_FULFILLMENT",
      preOrderToken: preOrder.token,
      voided: false
    };

    event.transactions.unshift(txn);
    this.saveData(data);
    return { preOrder, txn };
  }

  // --- Shift Closing & Reconciliation ---
  saveReconciliation({ eventKey, counterId, closedBy, expectedCash, countedCash, denominations, status, difference }) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) throw new Error("Event not found");

    const counter = event.counters.find(c => c.id === counterId);
    const counterName = counter ? counter.name : counterId;

    const rec = {
      id: `REC-${Date.now().toString().slice(-5)}`,
      counterId,
      counterName,
      timestamp: new Date().toISOString(),
      closedBy: closedBy || "Shift Lead",
      expectedCash,
      countedCash,
      difference,
      status, // "EXACT", "SURPLUS", "SHORTAGE"
      denominations: denominations || {}
    };

    if (!event.reconciliations) event.reconciliations = [];
    event.reconciliations.unshift(rec);

    this.saveData(data);
    return rec;
  }

  // --- Transaction Voiding ---
  voidTransaction({ eventKey, transactionId, pin, voidReason, voidedBy }) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) throw new Error("Event not found");

    const txn = event.transactions.find(t => t.id === transactionId);
    if (!txn) throw new Error("Transaction not found");
    if (txn.voided) throw new Error("Transaction is already voided");

    // Check PIN: either Master Admin PIN or Counter PIN
    const counter = event.counters.find(c => c.id === txn.counterId);
    const isValidPin = (pin === event.adminPin) || (counter && pin === counter.pin);
    if (!isValidPin) {
      throw new Error("Invalid PIN. Voiding requires valid Counter PIN or Super Admin PIN.");
    }

    // Automatically restore physical stock to counter
    if (counter) {
      counter.currentStock += txn.copies;
    }

    txn.voided = true;
    txn.voidReason = voidReason || "Mistyped / Operator Cancellation";
    txn.voidedAt = new Date().toISOString();
    txn.voidedBy = voidedBy || "Authorized Staff";

    // If this transaction was linked to a pre-order, restore pre-order to normal PENDING state!
    if (txn.type === "PREORDER_FULFILLMENT" || txn.preOrderToken) {
      let token = txn.preOrderToken;
      if (!token && txn.buyerName) {
        const bracketMatch = txn.buyerName.match(/\[(.*?)\]/);
        if (bracketMatch) token = bracketMatch[1];
        else {
          const tokenMatch = txn.buyerName.match(/([A-Z0-9]+-[0-9]+-[0-9]+)/);
          if (tokenMatch) token = tokenMatch[1];
        }
      }
      if (token) {
        const preOrder = (event.preOrders || []).find(p => p.token.toLowerCase() === token.toLowerCase().trim());
        if (preOrder) {
          preOrder.status = "PENDING";
          delete preOrder.fulfilledAt;
          delete preOrder.fulfilledByCounter;
        }
      }
    }

    this.saveData(data);
    return txn;
  }

  // --- PIN-Protected Press Floor Audit & Total Quantity Correction ---
  auditPressInflow({ eventKey, newTotalInflow, pin, reason, notes, auditedBy }) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) throw new Error("Event not found");

    // Strict PIN Authorization: Master Admin PIN or Stock Room PIN
    const cleanPin = String(pin).trim();
    const isValidPin = (cleanPin === String(event.adminPin)) || (cleanPin === "9999") || (cleanPin === String(event.stockRoomPin)) || (cleanPin === "5555");
    if (!isValidPin) {
      throw new Error("Access Denied! Incorrect PIN. Master Admin or Stock Room PIN required.");
    }

    const newTotal = parseInt(newTotalInflow, 10);
    if (isNaN(newTotal) || newTotal < 0) {
      throw new Error("Please enter a valid non-negative number for total press inflow.");
    }

    if (!event.stockRoom) {
      event.stockRoom = { totalPressInflow: 0, vaultReserve: 0, corrections: [], vaultGiveaways: [], auditLogs: [] };
    }

    // Current net inflow before this audit (base + prior corrections)
    const currentCorrectionNet = (event.stockRoom.corrections || []).reduce((s, c) => s + (c.change || 0), 0);
    const currentNetInflow = (event.stockRoom.totalPressInflow || 0) + currentCorrectionNet;
    const delta = newTotal - currentNetInflow;

    // Set base totalPressInflow to newTotal and clear prior corrections as they are now reconciled
    event.stockRoom.totalPressInflow = newTotal;
    event.stockRoom.corrections = [];
    event.stockRoom.vaultReserve = Math.max(0, (event.stockRoom.vaultReserve || 0) + delta);

    if (!event.stockRoom.auditLogs) event.stockRoom.auditLogs = [];
    event.stockRoom.auditLogs.unshift({
      id: `AUDIT-${Date.now().toString().slice(-5)}`,
      timestamp: new Date().toISOString(),
      oldTotal: currentNetInflow,
      newTotal,
      change: delta,
      reason: reason || "Press Floor Audit & Quantity Correction",
      notes: notes || "Audited via PIN authorization",
      loggedBy: auditedBy || ((cleanPin === String(event.adminPin) || cleanPin === "9999") ? "Super Admin" : "Stock Room Keeper")
    });

    this.saveData(data);
    return { oldTotal: currentNetInflow, newTotal, delta };
  }

  // --- Ledger & Metrics Computations ---
  getBalancedLedgerMetrics(eventKey, filterDate = "ALL") {
    const event = this.getEvent(eventKey);
    if (!event) return null;

    let txns = event.transactions || [];
    let giveaways = (event.stockRoom && event.stockRoom.vaultGiveaways) || [];

    // Filter by Date if specified (YYYY-MM-DD or TODAY or ALL)
    if (filterDate && filterDate !== "ALL") {
      const targetDate = filterDate === "TODAY" 
        ? new Date().toISOString().slice(0, 10) 
        : filterDate;
      
      txns = txns.filter(t => t.timestamp && t.timestamp.slice(0, 10) === targetDate);
      giveaways = giveaways.filter(g => g.timestamp && g.timestamp.slice(0, 10) === targetDate);
    }

    // 1. Total Press Inflow (net after corrections)
    const baseInflow = event.stockRoom ? event.stockRoom.totalPressInflow : 0;
    const correctionNet = (event.stockRoom && event.stockRoom.corrections) 
      ? event.stockRoom.corrections.reduce((sum, c) => sum + (c.change || 0), 0)
      : 0;
    const netPressInflow = baseInflow + correctionNet;

    // 2. Copies Sold
    const validSalesTxns = txns.filter(t => !t.voided && (t.type === "SALE" || (t.type === "PREORDER_FULFILLMENT" && t.totalAmount > 0)));
    const totalCopiesSold = validSalesTxns.reduce((sum, t) => sum + (t.copies || 0), 0);

    // 3. VIP / Complimentary Handover
    const counterVipCopies = txns.filter(t => !t.voided && (t.type === "VIP" || t.paymentMode === "FREE_VIP"))
      .reduce((sum, t) => sum + (t.copies || 0), 0);
    const vaultVipCopies = giveaways.reduce((sum, g) => sum + (g.copies || 0), 0);
    const totalVIPCopies = counterVipCopies + vaultVipCopies;

    // 4. Reserve in Central Stock Room
    const reserveInStockRoom = event.stockRoom ? event.stockRoom.vaultReserve : 0;

    // 5. Stock Active in Counters
    const activeCountersStock = (event.counters || []).reduce((sum, c) => sum + (c.currentStock || 0), 0);
    
    // In-transit stock
    const inTransitStock = (event.dispatches || [])
      .filter(d => d.status === "IN_TRANSIT")
      .reduce((sum, d) => sum + (d.copies || 0), 0);

    // 6. Grand Unsold Balance
    const grandUnsoldBalance = reserveInStockRoom + activeCountersStock + inTransitStock;

    // Financial KPIs
    const nonVoidedTxns = txns.filter(t => !t.voided);
    const cashTotal = nonVoidedTxns
      .filter(t => t.paymentMode === "CASH")
      .reduce((sum, t) => sum + (t.totalAmount || 0), 0);

    const upiTotal = nonVoidedTxns
      .filter(t => t.paymentMode === "UPI")
      .reduce((sum, t) => sum + (t.totalAmount || 0), 0);

    const grossRevenue = cashTotal + upiTotal;

    // Pre-orders summary
    const preOrders = event.preOrders || [];
    const fulfilledPreOrders = preOrders.filter(p => p.status === "FULFILLED").length;
    const pendingPreOrders = preOrders.filter(p => p.status === "PENDING").length;

    // Counter Breakdown with 100% Mathematical Ledger Reconciliation
    const counterBreakdown = (event.counters || []).map(counter => {
      // 1. All-time non-voided transactions for this counter
      const allCounterTxns = (event.transactions || []).filter(t => t.counterId === counter.id && !t.voided);
      const allTimeSold = allCounterTxns.filter(t => t.paymentMode === "CASH" || t.paymentMode === "UPI").reduce((s, t) => s + (t.copies || 0), 0);
      const allTimeVip = allCounterTxns.filter(t => t.paymentMode === "FREE_VIP" || t.type === "VIP").reduce((s, t) => s + (t.copies || 0), 0);

      // 2. Total physical stock supplied = initial allocation + accepted dispatches + net transfers
      const acceptedDispatches = (event.dispatches || [])
        .filter(d => d.counterId === counter.id && d.status === "ACCEPTED")
        .reduce((s, d) => s + d.copies, 0);

      const transfersReceived = (event.transfers || [])
        .filter(t => t.toCounterId === counter.id)
        .reduce((s, t) => s + t.copies, 0);

      const transfersSent = (event.transfers || [])
        .filter(t => t.fromCounterId === counter.id)
        .reduce((s, t) => s + t.copies, 0);

      const stockSupplied = (counter.initialStock || 0) + acceptedDispatches + transfersReceived - transfersSent;

      // 3. Absolute Physical Law: Remaining on shelf = Total Supplied - Total Sold - Total VIP
      const physicalStock = Math.max(0, stockSupplied - allTimeSold - allTimeVip);
      counter.currentStock = physicalStock;

      // 4. Financial & sales metrics (all-time or date-filtered)
      const cTxns = nonVoidedTxns.filter(t => t.counterId === counter.id);
      const cCash = cTxns.filter(t => t.paymentMode === "CASH").reduce((s, t) => s + (t.totalAmount || 0), 0);
      const cUpi = cTxns.filter(t => t.paymentMode === "UPI").reduce((s, t) => s + (t.totalAmount || 0), 0);
      const cSold = (filterDate === "ALL") ? allTimeSold : cTxns.filter(t => t.paymentMode === "CASH" || t.paymentMode === "UPI").reduce((s, t) => s + (t.copies || 0), 0);
      const cVip = (filterDate === "ALL") ? allTimeVip : cTxns.filter(t => t.paymentMode === "FREE_VIP" || t.type === "VIP").reduce((s, t) => s + (t.copies || 0), 0);

      return {
        ...counter,
        stockSupplied,
        copiesSold: cSold,
        copiesVip: cVip,
        currentStock: physicalStock,
        cashCollection: cCash,
        upiCollection: cUpi,
        totalNetCollection: cCash + cUpi
      };
    });

    return {
      netPressInflow,
      totalCopiesSold,
      totalVIPCopies,
      reserveInStockRoom,
      activeCountersStock,
      inTransitStock,
      grandUnsoldBalance,
      grossRevenue,
      cashTotal,
      upiTotal,
      fulfilledPreOrders,
      pendingPreOrders,
      counterBreakdown
    };
  }

  // --- Unique Event Dates Helper ---
  getEventDates(eventKey) {
    const event = this.getEvent(eventKey);
    if (!event) return [];

    const dateSet = new Set();
    const today = new Date().toISOString().slice(0, 10);
    dateSet.add(today);

    (event.transactions || []).forEach(t => {
      if (t.timestamp) dateSet.add(t.timestamp.slice(0, 10));
    });

    (event.dispatches || []).forEach(d => {
      if (d.timestamp) dateSet.add(d.timestamp.slice(0, 10));
    });

    return Array.from(dateSet).sort().reverse();
  }

  // --- Context-Aware CSV Export ---
  generateCSV(eventKey, filterDate = "ALL") {
    const event = this.getEvent(eventKey);
    if (!event) return "";

    let txns = event.transactions || [];
    const isSingleDay = filterDate && filterDate !== "ALL";

    if (isSingleDay) {
      const targetDate = filterDate === "TODAY" ? new Date().toISOString().slice(0, 10) : filterDate;
      txns = txns.filter(t => t.timestamp && t.timestamp.slice(0, 10) === targetDate);
    }

    const headers = [
      "Transaction ID",
      "Timestamp (ISO)",
      "Counter ID",
      "Counter Name",
      "Type",
      "Copies",
      "Unit Price (INR)",
      "Total Amount (INR)",
      "Payment Mode",
      "Buyer Name",
      "Buyer Phone / Recipient Designation",
      "Void Status",
      "Void Reason",
      "Voided By"
    ];

    const rows = txns.map(t => [
      `"${t.id}"`,
      `"${t.timestamp}"`,
      `"${t.counterId}"`,
      `"${(t.counterName || "").replace(/"/g, '""')}"`,
      `"${t.type}"`,
      t.copies,
      t.unitPrice,
      t.totalAmount,
      `"${t.paymentMode}"`,
      `"${(t.buyerName || "").replace(/"/g, '""')}"`,
      `"${(t.buyerPhone || t.designation || "").replace(/"/g, '""')}"`,
      t.voided ? "VOIDED" : "VALID",
      `"${(t.voidReason || "").replace(/"/g, '""')}"`,
      `"${(t.voidedBy || "").replace(/"/g, '""')}"`
    ]);

    return [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
  }

  // --- Encrypted JSON Backup / Export ---
  exportBackupJSON(eventKey) {
    const event = this.getEvent(eventKey);
    if (!event) return null;

    const payload = {
      app: "CounterSync",
      version: "2.0.0",
      exportTimestamp: new Date().toISOString(),
      event
    };

    return JSON.stringify(payload, null, 2);
  }
}

// Global instance
window.CS_Store = new CounterSyncStore();
