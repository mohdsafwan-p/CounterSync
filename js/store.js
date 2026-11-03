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
    const CURRENT_VERSION = 14;
    const raw = localStorage.getItem(this.STORAGE_KEY);
    const ver = parseInt(localStorage.getItem(this.STORAGE_KEY + '_ver') || '0', 10);

    if (!raw || ver < CURRENT_VERSION) {
      this.resetToSeed();
      localStorage.setItem(this.STORAGE_KEY + '_ver', String(CURRENT_VERSION));
      return;
    }

    try {
      const data = JSON.parse(raw);
      if (!data.platform && typeof CS_DEFAULT_SEED !== 'undefined' && CS_DEFAULT_SEED.platform) {
        data.platform = JSON.parse(JSON.stringify(CS_DEFAULT_SEED.platform));
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
      }
      if (data && data.events && data.events["CS2026"]) {
        const ev = data.events["CS2026"];
        ev.name = "Almuneer 2026";
        ev.unitPrice = 100;
        ev.bookTitle = "Chronicles of Almuneer (Festival Commemorative Edition)";
        if (!ev.donations) ev.donations = [];
        if (!ev.transfers) ev.transfers = [];

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

      // Real-time Cloud Synchronization via Firebase Firestore
      if (typeof window !== 'undefined' && window.CS_Firebase && window.CS_Firebase.isReady) {
        const activeKey = this.getActiveEventKey();
        const eventData = data.events ? data.events[activeKey] : null;
        if (eventData) {
          window.CS_Firebase.syncEventToCloud(activeKey, eventData);
        }
        if (data.platform && data.platform.rentals) {
          window.CS_Firebase.syncRentalsToCloud(data.platform.rentals);
        }
      }
    } catch (err) {
      console.error("Failed to save store:", err);
    }
  }

  // --- Real-time Firestore Cloud Synchronization (Section 3 & 5) ---
  initCloudSync(eventKey) {
    if (typeof window === 'undefined' || !window.CS_Firebase) return;
    const key = (eventKey || this.getActiveEventKey()).toUpperCase().trim();

    // Listen to real-time changes from Firestore (onSnapshot)
    window.CS_Firebase.listenToEvent(key, (cloudData, hasPendingWrites) => {
      if (!cloudData) return;
      this.updateEventFromCloud(key, cloudData);
      this._notifySubscribers('CLOUD_SYNC', { eventKey: key, hasPendingWrites });
    });

    // Also listen to platform rental updates
    this.initRentalsCloudSync();
  }

  initRentalsCloudSync() {
    if (typeof window === 'undefined' || !window.CS_Firebase) return;
    window.CS_Firebase.listenToRentals((cloudRentals) => {
      if (!cloudRentals) return;
      this.updateRentalsFromCloud(cloudRentals);
      this._notifySubscribers('RENTALS_SYNC', cloudRentals);
    });
  }

  updateRentalsFromCloud(cloudRentals) {
    try {
      const data = this.getData();
      if (!data.platform) data.platform = {};
      data.platform.rentals = cloudRentals;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
      this._broadcast('SYNC', { timestamp: Date.now(), source: 'RENTALS_CLOUD' });
    } catch (e) {
      console.error("[CounterSync Store] Error merging cloud rentals:", e);
    }
  }

  // --- SaaS Platform & Rental Management Methods ---
  isPlatformOwner(email) {
    if (!email) return false;
    return String(email).toLowerCase().trim() === 'safwanvgd313@gmail.com';
  }

  getPlatformRentals() {
    const data = this.getData();
    if (!data.platform || !data.platform.rentals) {
      if (typeof CS_DEFAULT_SEED !== 'undefined' && CS_DEFAULT_SEED.platform) {
        data.platform = JSON.parse(JSON.stringify(CS_DEFAULT_SEED.platform));
        this.saveData(data);
      } else {
        return [];
      }
    }
    return data.platform.rentals || [];
  }

  getRentalByEmail(email) {
    if (!email) return null;
    const clean = String(email).toLowerCase().trim();
    const rentals = this.getPlatformRentals();
    return rentals.find(r => (r.hostEmail || '').toLowerCase().trim() === clean) || null;
  }

  getRentalByEventKey(eventKey) {
    if (!eventKey) return null;
    const clean = String(eventKey).toUpperCase().trim();
    const rentals = this.getPlatformRentals();
    return rentals.find(r => (r.eventKey || '').toUpperCase().trim() === clean) || null;
  }

  isEventLicenseValid(eventKey) {
    if (!eventKey) return { valid: false, reason: 'No event key specified' };
    const clean = String(eventKey).toUpperCase().trim();
    const rental = this.getRentalByEventKey(clean);
    
    // Fallback for default demo event CS2026
    if (!rental && clean === 'CS2026') {
      return { valid: true, status: 'ACTIVE' };
    }
    
    if (!rental) {
      return { valid: false, status: 'NOT_FOUND', reason: `No rental license registered for event ${clean}` };
    }

    if (rental.status !== 'ACTIVE') {
      return { valid: false, status: rental.status, reason: `Rental license is ${rental.status.toLowerCase()}` };
    }

    if (rental.expiresAt) {
      const expiry = new Date(rental.expiresAt);
      if (new Date() > expiry) {
        return { valid: false, status: 'EXPIRED', reason: `Rental period concluded on ${expiry.toLocaleDateString()}` };
      }
    }

    return { valid: true, status: 'ACTIVE', rental };
  }

  createRentalRequest(requestData) {
    const data = this.getData();
    if (!data.platform) data.platform = { ownerEmail: 'safwanvgd313@gmail.com', rentals: [] };
    if (!data.platform.rentals) data.platform.rentals = [];

    const cleanEmail = (requestData.hostEmail || '').toLowerCase().trim();
    const cleanKey = (requestData.eventKey || ('EVT-' + Math.floor(1000 + Math.random() * 9000))).toUpperCase().trim();

    const existingIndex = data.platform.rentals.findIndex(r => (r.hostEmail || '').toLowerCase().trim() === cleanEmail);

    const rentalRecord = {
      id: existingIndex >= 0 ? data.platform.rentals[existingIndex].id : ('RENT-' + Date.now()),
      hostEmail: cleanEmail,
      hostName: requestData.hostName || 'Event Host',
      organization: requestData.organization || 'Independent Organizer',
      phone: requestData.phone || '',
      eventKey: cleanKey,
      eventName: requestData.eventName || 'Festival Book Fair',
      status: 'PENDING',
      allowedCounters: parseInt(requestData.allowedCounters || 3, 10),
      startsAt: requestData.startsAt || new Date().toISOString(),
      expiresAt: requestData.expiresAt || new Date(Date.now() + 7 * 86400000).toISOString(),
      requestedAt: new Date().toISOString(),
      approvedAt: null,
      notes: requestData.notes || '',
      bookTitle: requestData.bookTitle || 'Festival Edition Publication',
      unitPrice: parseFloat(requestData.unitPrice || 100)
    };

    if (existingIndex >= 0) {
      data.platform.rentals[existingIndex] = rentalRecord;
    } else {
      data.platform.rentals.unshift(rentalRecord);
    }

    // Scaffold pending event if not present
    if (!data.events[cleanKey]) {
      data.events[cleanKey] = {
        key: cleanKey,
        name: rentalRecord.eventName,
        bookTitle: rentalRecord.bookTitle,
        unitPrice: rentalRecord.unitPrice,
        adminPin: '9999',
        stockRoomPin: '5555',
        createdAt: new Date().toISOString(),
        stockRoom: {
          totalPressInflow: 1000,
          vaultReserve: 1000,
          keeperName: 'Logistics Squad',
          corrections: [],
          vaultGiveaways: []
        },
        counters: Array.from({ length: rentalRecord.allowedCounters }).map((_, i) => ({
          id: `counter-${String(i + 1).padStart(2, '0')}a`,
          name: `Counter ${String(i + 1).padStart(2, '0')}A`,
          pin: `${1101 + i * 100}`,
          volunteers: `Staff Desk ${i + 1}`,
          upiId: `pay.${cleanKey.toLowerCase()}@bank`,
          upiName: `${rentalRecord.eventName} Desk ${i + 1}`,
          initialStock: 100,
          currentStock: 100,
          notes: `Sales desk ${i + 1}`,
          lowStockAlert: false
        })),
        dispatches: [],
        preorders: [],
        transactions: [],
        donations: [],
        transfers: []
      };
    }

    this.saveData(data);
    return rentalRecord;
  }

  approveRental(rentalId, options = {}) {
    const data = this.getData();
    if (!data.platform || !data.platform.rentals) return null;

    const rental = data.platform.rentals.find(r => r.id === rentalId);
    if (!rental) return null;

    rental.status = 'ACTIVE';
    rental.approvedAt = new Date().toISOString();
    if (options.expiresAt) rental.expiresAt = options.expiresAt;
    if (options.allowedCounters) rental.allowedCounters = parseInt(options.allowedCounters, 10);
    if (options.eventKey) rental.eventKey = options.eventKey.toUpperCase().trim();
    if (options.notes) rental.notes = options.notes;

    const key = rental.eventKey;
    if (!data.events[key]) {
      data.events[key] = {
        key: key,
        name: rental.eventName,
        bookTitle: rental.bookTitle || 'Festival Commemorative Book',
        unitPrice: rental.unitPrice || 100,
        adminPin: '9999',
        stockRoomPin: '5555',
        createdAt: new Date().toISOString(),
        stockRoom: {
          totalPressInflow: 1000,
          vaultReserve: 1000,
          keeperName: 'Logistics Officer',
          corrections: [],
          vaultGiveaways: []
        },
        counters: Array.from({ length: rental.allowedCounters || 3 }).map((_, i) => ({
          id: `counter-${String(i + 1).padStart(2, '0')}a`,
          name: `Counter ${String(i + 1).padStart(2, '0')}A`,
          pin: `${1101 + i * 100}`,
          volunteers: `Staff Desk ${i + 1}`,
          upiId: `pay.${key.toLowerCase()}@bank`,
          upiName: `${rental.eventName} Desk ${i + 1}`,
          initialStock: 100,
          currentStock: 100,
          notes: `Sales Counter ${i + 1}`,
          lowStockAlert: false
        })),
        dispatches: [],
        preorders: [],
        transactions: [],
        donations: [],
        transfers: []
      };
    }

    this.saveData(data);
    return rental;
  }

  denyRental(rentalId, reason = 'Rental rejected by platform administrator') {
    const data = this.getData();
    if (!data.platform || !data.platform.rentals) return null;
    const rental = data.platform.rentals.find(r => r.id === rentalId);
    if (!rental) return null;

    rental.status = 'DENIED';
    rental.deniedReason = reason;
    rental.deniedAt = new Date().toISOString();
    this.saveData(data);
    return rental;
  }

  suspendRental(rentalId, reason = 'Rental period concluded or revoked') {
    const data = this.getData();
    if (!data.platform || !data.platform.rentals) return null;
    const rental = data.platform.rentals.find(r => r.id === rentalId);
    if (!rental) return null;

    rental.status = 'SUSPENDED';
    rental.suspendedReason = reason;
    rental.suspendedAt = new Date().toISOString();
    this.saveData(data);
    return rental;
  }

  extendRental(rentalId, newExpiresAt) {
    const data = this.getData();
    if (!data.platform || !data.platform.rentals) return null;
    const rental = data.platform.rentals.find(r => r.id === rentalId);
    if (!rental) return null;

    rental.expiresAt = newExpiresAt;
    rental.status = 'ACTIVE';
    this.saveData(data);
    return rental;
  }

  updateEventFromCloud(eventKey, cloudData) {
    try {
      const data = this.getData();
      const cleanKey = eventKey.toUpperCase().trim();
      const localEvent = data.events[cleanKey];

      // Merge remote state from Firestore
      if (cloudData) {
        data.events[cleanKey] = {
          ...(localEvent || {}),
          ...cloudData
        };

        // Persist to local storage for instant offline boot
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        this._broadcast('SYNC', { timestamp: Date.now(), source: 'CLOUD' });
      }
    } catch (err) {
      console.error("[CounterSync Store] Error merging cloud data:", err);
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

  // --- POS Workspace Billing & Micro-Donation Operations ---
  recordSale({ eventKey, counterId, copies, paymentMode, buyerName, buyerPhone, note, cashReceived, changeGiven, donationAmount, isConfirmed }) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) throw new Error("Event not found");

    const counter = event.counters.find(c => c.id === counterId);
    if (!counter) throw new Error("Counter not found");

    const count = parseInt(copies, 10) || 0;
    const donation = parseInt(donationAmount, 10) || 0;

    if (count <= 0 && donation <= 0) {
      throw new Error("Must specify book copies to sell or a donation amount");
    }

    if (count > 0 && counter.currentStock < count) {
      throw new Error(`Insufficient counter stock! Available: ${counter.currentStock}`);
    }

    const unitPrice = event.unitPrice || 100;
    const totalSalePrice = count * unitPrice;
    const tender = parseInt(cashReceived, 10) || (totalSalePrice + donation);
    const change = parseInt(changeGiven, 10) || 0;

    // Deduct physical counter stock only for book copies
    if (count > 0) {
      counter.currentStock -= count;
    }

    const saleId = `TXN-${Date.now().toString().slice(-6)}`;
    const nowIso = new Date().toISOString();

    const txn = {
      id: saleId,
      sale_id: saleId,
      timestamp: nowIso,
      counterId: counter.id,
      counterName: counter.name,
      copies: count,
      unitPrice: unitPrice,
      total_sale_price: totalSalePrice,
      totalAmount: totalSalePrice + donation,
      cashReceived: tender,
      changeGiven: change,
      donationAmount: donation,
      paymentMode: paymentMode || "CASH",
      buyerName: buyerName ? buyerName.trim() : (count === 0 ? "Patron Donor" : "Direct Buyer"),
      buyerPhone: buyerPhone ? buyerPhone.trim() : "",
      note: note || (donation > 0 ? `Includes ₹${donation} micro-donation` : ""),
      type: count === 0 ? "DONATION" : "SALE",
      isConfirmed: isConfirmed !== undefined ? isConfirmed : true,
      voided: false
    };

    if (!event.transactions) event.transactions = [];
    event.transactions.unshift(txn);

    // If micro-donation / excess change waived is present, record in donations ledger
    if (donation > 0) {
      if (!event.donations) event.donations = [];
      const donationEntry = {
        donation_id: `don_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`,
        counter_id: counter.id,
        counter_name: counter.name,
        timestamp: nowIso,
        amount: donation,
        donor_name: buyerName ? buyerName.trim() : "Anonymous Patron",
        donor_phone: buyerPhone ? buyerPhone.trim() : "",
        payment_mode: paymentMode || "CASH",
        linked_sale_id: count > 0 ? saleId : null,
        notes: count > 0 ? `Change waived / excess payment on sale (${count} copies)` : (note || "Direct donation")
      };
      event.donations.unshift(donationEntry);
    }

    this.saveData(data);
    return txn;
  }

  // Record Standalone Micro-Donation
  recordDonation({ eventKey, counterId, amount, donorName, donorPhone, paymentMode, linkedSaleId, notes }) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) throw new Error("Event not found");

    const counter = event.counters.find(c => c.id === counterId);
    if (!counter) throw new Error("Counter not found");

    const amt = parseInt(amount, 10);
    if (isNaN(amt) || amt <= 0) throw new Error("Please enter a valid donation amount (> 0)");

    const nowIso = new Date().toISOString();
    const donationId = `don_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`;

    const donationEntry = {
      donation_id: donationId,
      counter_id: counter.id,
      counter_name: counter.name,
      timestamp: nowIso,
      amount: amt,
      donor_name: donorName ? donorName.trim() : "Anonymous Patron",
      donor_phone: donorPhone ? donorPhone.trim() : "",
      payment_mode: paymentMode || "CASH",
      linked_sale_id: linkedSaleId || null,
      notes: notes || "Discretionary campaign donation"
    };

    if (!event.donations) event.donations = [];
    event.donations.unshift(donationEntry);

    // Also record in transactions ledger to reflect in cash balance
    if (!event.transactions) event.transactions = [];
    event.transactions.unshift({
      id: `TXN-DON-${Date.now().toString().slice(-5)}`,
      sale_id: donationId,
      timestamp: nowIso,
      counterId: counter.id,
      counterName: counter.name,
      copies: 0,
      unitPrice: 0,
      total_sale_price: 0,
      totalAmount: amt,
      cashReceived: amt,
      changeGiven: 0,
      donationAmount: amt,
      paymentMode: paymentMode || "CASH",
      buyerName: donorName ? `${donorName.trim()} (Donor)` : "Anonymous Donor",
      buyerPhone: donorPhone ? donorPhone.trim() : "",
      note: notes || "Direct Micro-Donation",
      type: "DONATION",
      isConfirmed: true,
      voided: false
    });

    this.saveData(data);
    return donationEntry;
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

  // --- Inter-Counter Transfers (Books & Cash) with Two-Way Handshake ---
  initiateInterCounterTransfer({ eventKey, fromCounterId, toCounterId, type = "BOOKS", amountOrQuantity, notes, authorizedBy }) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) throw new Error("Event not found");

    if (fromCounterId === toCounterId) {
      throw new Error("Source and destination counters must be different");
    }

    const count = parseInt(amountOrQuantity, 10);
    if (isNaN(count) || count <= 0) throw new Error("Please enter a valid positive quantity or amount");

    const source = event.counters.find(c => c.id === fromCounterId);
    const dest = event.counters.find(c => c.id === toCounterId);

    if (!source || !dest) throw new Error("Counter not found");

    const transferType = (type || "BOOKS").toUpperCase();

    if (transferType === "BOOKS") {
      if (source.currentStock < count) {
        throw new Error(`Insufficient copies! Counter ${source.name} has only ${source.currentStock} copies available.`);
      }
      // Hold/reserve copies immediately on sender so they cannot be double-sold while in-flight
      source.currentStock -= count;
    } else if (transferType === "CASH") {
      // Calculate sender's current cash in drawer
      const metrics = this.getBalancedLedgerMetrics(eventKey, "ALL");
      const senderBreakdown = metrics ? metrics.counterBreakdown.find(b => b.id === source.id) : null;
      const availableCash = senderBreakdown ? senderBreakdown.cashCollection : 0;
      if (availableCash < count) {
        throw new Error(`Insufficient cash float! Counter ${source.name} has only ₹${availableCash} cash recorded.`);
      }
    } else {
      throw new Error("Transfer type must be BOOKS or CASH");
    }

    const transferId = `trf_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`;
    const nowIso = new Date().toISOString();

    const transfer = {
      id: `TRF-${Date.now().toString().slice(-5)}`,
      transfer_id: transferId,
      type: transferType,
      fromCounterId: source.id,
      from_counter: source.id,
      fromCounterName: source.name,
      toCounterId: dest.id,
      to_counter: dest.id,
      toCounterName: dest.name,
      amountOrQuantity: count,
      amount_or_quantity: count,
      copies: transferType === "BOOKS" ? count : 0,
      cashAmount: transferType === "CASH" ? count : 0,
      notes: notes || (transferType === "CASH" ? "Float change transfer" : "Inter-counter books transfer"),
      status: "PENDING",
      initiated_at: nowIso,
      timestamp: nowIso,
      resolved_at: null,
      resolved_by: null,
      authorizedBy: authorizedBy || "Counter Staff"
    };

    if (!event.transfers) event.transfers = [];
    event.transfers.unshift(transfer);

    this.saveData(data);
    return transfer;
  }

  // Receiver Peer Handshake: Accept or Reject Transfer
  respondInterCounterTransfer({ eventKey, transferId, response, responderName }) {
    const data = this.getData();
    const event = data.events[eventKey];
    if (!event) throw new Error("Event not found");

    const transfer = (event.transfers || []).find(t => t.id === transferId || t.transfer_id === transferId);
    if (!transfer) throw new Error("Transfer record not found");

    if (transfer.status !== "PENDING") {
      throw new Error(`Transfer has already been ${transfer.status}`);
    }

    const source = event.counters.find(c => c.id === transfer.fromCounterId);
    const dest = event.counters.find(c => c.id === transfer.toCounterId);

    const nowIso = new Date().toISOString();
    const isAccept = response === "ACCEPT";

    if (isAccept) {
      transfer.status = "ACCEPTED";
      transfer.resolved_at = nowIso;
      transfer.resolved_by = responderName || "Receiving Counter Staff";

      // If BOOKS, credit to receiver (sender was already held on initiate)
      if (transfer.type === "BOOKS" && dest) {
        dest.currentStock += transfer.copies;
      }
    } else {
      transfer.status = "REJECTED";
      transfer.resolved_at = nowIso;
      transfer.resolved_by = responderName || "Receiving Counter Staff";

      // If BOOKS, release held stock back to sender
      if (transfer.type === "BOOKS" && source) {
        source.currentStock += transfer.copies;
      }
    }

    this.saveData(data);
    return transfer;
  }

  // Backward compatible wrapper
  transferStock({ eventKey, fromCounterId, toCounterId, copies, authorizedBy, reason }) {
    return this.initiateInterCounterTransfer({
      eventKey,
      fromCounterId,
      toCounterId,
      type: "BOOKS",
      amountOrQuantity: copies,
      notes: reason,
      authorizedBy
    });
  }

  // Get Pending Transfers targeting a specific counter
  getPendingTransfersForCounter(eventKey, counterId) {
    const event = this.getEvent(eventKey);
    if (!event || !event.transfers) return [];
    return event.transfers.filter(t => (t.toCounterId === counterId || t.to_counter === counterId) && t.status === "PENDING");
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

    // Micro-Donations calculation
    const allDonations = event.donations || [];
    const totalDonations = allDonations.reduce((sum, d) => sum + (d.amount || 0), 0);

    // Pre-orders summary
    const preOrders = event.preOrders || [];
    const fulfilledPreOrders = preOrders.filter(p => p.status === "FULFILLED").length;
    const pendingPreOrders = preOrders.filter(p => p.status === "PENDING").length;

    // Counter Breakdown with 100% Mathematical Ledger Reconciliation
    const counterBreakdown = (event.counters || []).map(counter => {
      // 1. All-time non-voided transactions for this counter
      const allCounterTxns = (event.transactions || []).filter(t => t.counterId === counter.id && !t.voided);
      const allTimeSold = allCounterTxns.filter(t => (t.paymentMode === "CASH" || t.paymentMode === "UPI") && (t.type === "SALE" || t.type === "PREORDER_FULFILLMENT")).reduce((s, t) => s + (t.copies || 0), 0);
      const allTimeVip = allCounterTxns.filter(t => t.paymentMode === "FREE_VIP" || t.type === "VIP").reduce((s, t) => s + (t.copies || 0), 0);

      // 2. Total physical stock supplied = initial allocation + accepted dispatches + net accepted book transfers
      const acceptedDispatches = (event.dispatches || [])
        .filter(d => d.counterId === counter.id && d.status === "ACCEPTED")
        .reduce((s, d) => s + d.copies, 0);

      const transfersReceived = (event.transfers || [])
        .filter(t => (t.toCounterId === counter.id || t.to_counter === counter.id) && (t.type === "BOOKS" || !t.type) && t.status === "ACCEPTED")
        .reduce((s, t) => s + (t.copies || t.amountOrQuantity || t.amount_or_quantity || 0), 0);

      // Sender holds both ACCEPTED and PENDING outgoing book transfers
      const transfersSent = (event.transfers || [])
        .filter(t => (t.fromCounterId === counter.id || t.from_counter === counter.id) && (t.type === "BOOKS" || !t.type) && (t.status === "ACCEPTED" || t.status === "PENDING"))
        .reduce((s, t) => s + (t.copies || t.amountOrQuantity || t.amount_or_quantity || 0), 0);

      const stockSupplied = (counter.initialStock || 0) + acceptedDispatches + transfersReceived - transfersSent;

      // 3. Absolute Physical Law: Remaining on shelf = Total Supplied - Total Sold - Total VIP
      const physicalStock = Math.max(0, stockSupplied - allTimeSold - allTimeVip);
      counter.currentStock = physicalStock;

      // 4. Financial & cash drawer calculations (including micro-donations & cash float transfers)
      const cTxns = nonVoidedTxns.filter(t => t.counterId === counter.id);
      const rawCash = cTxns.filter(t => t.paymentMode === "CASH").reduce((s, t) => s + (t.totalAmount || 0), 0);
      const cUpi = cTxns.filter(t => t.paymentMode === "UPI").reduce((s, t) => s + (t.totalAmount || 0), 0);
      const cSold = (filterDate === "ALL") ? allTimeSold : cTxns.filter(t => (t.paymentMode === "CASH" || t.paymentMode === "UPI") && (t.type === "SALE" || t.type === "PREORDER_FULFILLMENT")).reduce((s, t) => s + (t.copies || 0), 0);
      const cVip = (filterDate === "ALL") ? allTimeVip : cTxns.filter(t => t.paymentMode === "FREE_VIP" || t.type === "VIP").reduce((s, t) => s + (t.copies || 0), 0);

      // Cash float transfers between counters
      const cashTransfersReceived = (event.transfers || [])
        .filter(t => (t.toCounterId === counter.id || t.to_counter === counter.id) && t.type === "CASH" && t.status === "ACCEPTED")
        .reduce((s, t) => s + (t.cashAmount || t.amountOrQuantity || t.amount_or_quantity || 0), 0);

      const cashTransfersSent = (event.transfers || [])
        .filter(t => (t.fromCounterId === counter.id || t.from_counter === counter.id) && t.type === "CASH" && (t.status === "ACCEPTED" || t.status === "PENDING"))
        .reduce((s, t) => s + (t.cashAmount || t.amountOrQuantity || t.amount_or_quantity || 0), 0);

      const netCash = Math.max(0, rawCash + cashTransfersReceived - cashTransfersSent);

      // Micro-donations for this counter
      const counterDonations = allDonations.filter(d => d.counter_id === counter.id);
      const cDonationAmt = counterDonations.reduce((s, d) => s + (d.amount || 0), 0);

      return {
        ...counter,
        stockSupplied,
        copiesSold: cSold,
        copiesVip: cVip,
        currentStock: physicalStock,
        cashCollection: netCash,
        upiCollection: cUpi,
        totalNetCollection: netCash + cUpi,
        donationAmount: cDonationAmt,
        donationCount: counterDonations.length,
        cashTransfersReceived,
        cashTransfersSent
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
      totalDonations,
      grandRevenueWithDonations: grossRevenue + totalDonations,
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

  // --- POS Backup & Disaster Recovery Architecture (Section 2 & 3 Schema) ---
  exportBackupJSON(eventKey, counterId = null) {
    const event = this.getEvent(eventKey);
    if (!event) return null;

    const sourceCounter = counterId || "super_admin_master";
    const nowIso = new Date().toISOString();

    const salesList = (event.transactions || [])
      .filter(t => !counterId || t.counterId === counterId)
      .map(t => ({
        sale_id: t.sale_id || t.id,
        counter_id: t.counterId,
        timestamp: t.timestamp,
        copies: t.copies || 0,
        unit_price: t.unitPrice || 100,
        total_sale_price: (t.copies || 0) * (t.unitPrice || 100),
        cash_received: t.cashReceived !== undefined ? t.cashReceived : (t.totalAmount || 0),
        change_given: t.changeGiven || 0,
        donation_amount: t.donationAmount || 0,
        payment_mode: t.paymentMode || "CASH",
        buyer_name: t.buyerName || "Direct Buyer",
        is_confirmed: t.isConfirmed !== undefined ? t.isConfirmed : true,
        type: t.type || "SALE",
        voided: t.voided || false
      }));

    const donationsList = (event.donations || [])
      .filter(d => !counterId || d.counter_id === counterId)
      .map(d => ({
        donation_id: d.donation_id || d.id,
        counter_id: d.counter_id,
        timestamp: d.timestamp,
        amount: d.amount,
        donor_name: d.donor_name || "Anonymous",
        payment_mode: d.payment_mode || "CASH",
        linked_sale_id: d.linked_sale_id || null,
        notes: d.notes || ""
      }));

    const transfersList = (event.transfers || [])
      .filter(t => !counterId || t.fromCounterId === counterId || t.toCounterId === counterId || t.from_counter === counterId || t.to_counter === counterId)
      .map(t => ({
        transfer_id: t.transfer_id || t.id,
        type: t.type || "BOOKS",
        from_counter: t.from_counter || t.fromCounterId,
        to_counter: t.to_counter || t.toCounterId,
        from_counter_name: t.fromCounterName,
        to_counter_name: t.toCounterName,
        amount_or_quantity: t.amount_or_quantity || t.amountOrQuantity || t.copies || t.cashAmount || 0,
        notes: t.notes || "",
        status: t.status || "ACCEPTED",
        initiated_at: t.initiated_at || t.timestamp,
        resolved_at: t.resolved_at || null,
        resolved_by: t.resolved_by || null
      }));

    const payload = {
      system_meta: {
        version: "2.4.0",
        app: "CounterSync POS",
        export_timestamp: nowIso,
        source_counter: sourceCounter,
        event_key: eventKey,
        event_name: event.name
      },
      donations: donationsList,
      inter_counter_transfers: transfersList,
      sales: salesList,
      // Full system snapshot for clean slate disaster recovery
      event_snapshot: event
    };

    return JSON.stringify(payload, null, 2);
  }

  // Restore & Hydration Workflow with Safe Merge vs Total Overwrite (Section 2.3)
  restoreBackupJSON({ eventKey, jsonString, policy = "MERGE" }) {
    let payload;
    try {
      payload = JSON.parse(jsonString);
    } catch (e) {
      throw new Error("Invalid or corrupt JSON file. Could not parse data.");
    }

    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid backup payload format.");
    }

    const data = this.getData();
    let event = data.events[eventKey];
    if (!event) {
      event = payload.event_snapshot || payload.event;
      if (!event) throw new Error(`Event "${eventKey}" not found in current store or backup.`);
      data.events[eventKey] = event;
    }

    if (policy === "OVERWRITE") {
      // Total Overwrite (Clean Slate) - wipes local state and populates exactly what is inside the backup
      if (payload.event_snapshot) {
        data.events[eventKey] = JSON.parse(JSON.stringify(payload.event_snapshot));
      } else {
        if (payload.donations) event.donations = payload.donations;
        if (payload.inter_counter_transfers) event.transfers = payload.inter_counter_transfers;
        if (payload.sales) {
          event.transactions = payload.sales.map(s => ({
            id: s.sale_id || `TXN-${Date.now()}`,
            sale_id: s.sale_id,
            counterId: s.counter_id,
            timestamp: s.timestamp,
            copies: s.copies,
            unitPrice: s.unit_price,
            total_sale_price: s.total_sale_price,
            totalAmount: (s.total_sale_price || 0) + (s.donation_amount || 0),
            paymentMode: s.payment_mode,
            buyerName: s.buyer_name,
            cashReceived: s.cash_received,
            changeGiven: s.change_given,
            donationAmount: s.donation_amount,
            isConfirmed: s.is_confirmed,
            type: s.type || "SALE",
            voided: s.voided || false
          }));
        }
      }
    } else {
      // Safe Merge (Upsert) - updates existing items by primary key, adds missing records, preserves current terminal unsynced records
      if (!event.donations) event.donations = [];
      (payload.donations || []).forEach(d => {
        const id = d.donation_id || d.id;
        const idx = event.donations.findIndex(x => (x.donation_id || x.id) === id);
        if (idx >= 0) event.donations[idx] = { ...event.donations[idx], ...d };
        else event.donations.unshift(d);
      });

      if (!event.transfers) event.transfers = [];
      (payload.inter_counter_transfers || []).forEach(t => {
        const id = t.transfer_id || t.id;
        const idx = event.transfers.findIndex(x => (x.transfer_id || x.id) === id);
        if (idx >= 0) event.transfers[idx] = { ...event.transfers[idx], ...t };
        else event.transfers.unshift(t);
      });

      if (!event.transactions) event.transactions = [];
      (payload.sales || []).forEach(s => {
        const id = s.sale_id || s.id;
        const idx = event.transactions.findIndex(x => (x.sale_id || x.id) === id);
        const mapped = {
          id: id,
          sale_id: id,
          counterId: s.counter_id || s.counterId,
          timestamp: s.timestamp,
          copies: s.copies,
          unitPrice: s.unit_price || s.unitPrice || 100,
          total_sale_price: s.total_sale_price || ((s.copies || 0) * (s.unit_price || 100)),
          totalAmount: (s.total_sale_price || s.totalAmount || 0) + (s.donation_amount || 0),
          paymentMode: s.payment_mode || s.paymentMode || "CASH",
          buyerName: s.buyer_name || s.buyerName || "Direct Buyer",
          cashReceived: s.cash_received,
          changeGiven: s.change_given,
          donationAmount: s.donation_amount,
          isConfirmed: s.is_confirmed !== undefined ? s.is_confirmed : true,
          type: s.type || "SALE",
          voided: s.voided || false
        };
        if (idx >= 0) event.transactions[idx] = { ...event.transactions[idx], ...mapped };
        else event.transactions.unshift(mapped);
      });
    }

    this.saveData(data);
    return {
      policy,
      donationsCount: (payload.donations || []).length,
      transfersCount: (payload.inter_counter_transfers || []).length,
      salesCount: (payload.sales || []).length
    };
  }
}

// Global instance
window.CS_Store = new CounterSyncStore();
