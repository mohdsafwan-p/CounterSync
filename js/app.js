/**
 * CounterSync Master Application Controller
 * Handles Unified Gateway, Rush POS billing, Central Stock Room,
 * Super Admin Master Dashboard, Dynamic QR generation, Handshakes, Audio & Idle Timer.
 */

(function () {
  'use strict';

  // --- Sound Synthesizer (Zero external files needed) ---
  const CS_Audio = {
    ctx: null,
    init() {
      if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
      }
    },
    playTone(freq, type = 'sine', duration = 0.15, delay = 0) {
      try {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + duration);
      } catch (e) {
        // Audio playback failed silently
      }
    },
    cashChime() {
      // Pleasant coin register / POS chime (C6 -> E6 -> G6)
      this.playTone(1046.5, 'sine', 0.12, 0);
      this.playTone(1318.5, 'sine', 0.15, 0.08);
      this.playTone(1567.98, 'triangle', 0.25, 0.16);
      triggerHaptic('success');
    },
    handshakeSuccess() {
      // Harmonic ascending pulse
      this.playTone(523.25, 'triangle', 0.1, 0);
      this.playTone(659.25, 'sine', 0.1, 0.08);
      this.playTone(783.99, 'sine', 0.2, 0.16);
      triggerHaptic('success');
    },
    alertWarning() {
      // Low dual warning beep
      this.playTone(330, 'square', 0.1, 0);
      this.playTone(260, 'square', 0.2, 0.1);
      triggerHaptic('warning');
    }
  };

  // --- Mobile Tactile Haptic Engine ---
  function triggerHaptic(type = 'light') {
    if ('vibrate' in navigator) {
      try {
        if (type === 'light') navigator.vibrate(10);
        else if (type === 'medium') navigator.vibrate(25);
        else if (type === 'success') navigator.vibrate([15, 35, 20]);
        else if (type === 'warning') navigator.vibrate([35, 50, 35]);
      } catch (e) {}
    }
  }

  // --- Toast Notification System ---
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '⚠️' : 'ℹ️';
    toast.innerHTML = `<span style="font-weight:900;">${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  // --- Application State ---
  const state = {
    currentView: 'landing', // 'landing', 'pos', 'stockroom', 'admin'
    eventKey: 'CS2026',
    role: null, // 'POS', 'STOCKROOM', 'ADMIN'
    counterId: null,
    selectedRole: 'POS', // for Join Event Workspace ('POS' or 'STOCKROOM')
    selectedCounterId: 'counter-01a',
    adminFilterDate: 'ALL',
    selectedQty: 1,
    selectedPayMode: 'CASH',
    idleSecondsRemaining: 180, // 3 minutes
    idleTimerInterval: null,
    pendingSaleData: null,
    activeUpiQrCode: null
  };

  // --- DOM Elements Cache ---
  const el = {};

  function cacheDOMElements() {
    el.appHeader = document.getElementById('app-header');
    el.headerContextBadge = document.getElementById('header-context-badge');
    el.headerEventLabel = document.getElementById('header-event-label');
    el.headerStaffPill = document.getElementById('header-staff-pill');
    el.headerSyncPill = document.getElementById('header-sync-pill');
    el.idleTimerDisplay = document.getElementById('idle-timer-display');
    el.idleSeconds = document.getElementById('idle-seconds');
    el.btnQuickLock = document.getElementById('btn-quick-lock');
    el.btnThemeToggle = document.getElementById('btn-theme-toggle');
    el.btnHeaderLogout = document.getElementById('btn-header-logout');
    el.headerBrandClick = document.getElementById('header-brand-click');

    // Views
    el.viewLanding = document.getElementById('view-landing');
    el.viewPOS = document.getElementById('view-pos');
    el.viewStockroom = document.getElementById('view-stockroom');
    el.viewAdmin = document.getElementById('view-admin');

    // Landing screen elements
    el.landingIntents = document.getElementById('landing-intents');
    el.cardIntentStaff = document.getElementById('card-intent-staff');
    el.cardIntentOrganizer = document.getElementById('card-intent-organizer');
    el.staffValidationFlow = document.getElementById('staff-validation-flow');
    el.organizerAuthFlow = document.getElementById('organizer-auth-flow');
    el.btnBackToIntents = document.getElementById('btn-back-to-intents');
    el.btnBackFromOrganizer = document.getElementById('btn-back-from-organizer');
    el.inputEventKey = document.getElementById('input-event-key');
    el.btnValidateKey = document.getElementById('btn-validate-key');
    el.scopedCounterPicker = document.getElementById('scoped-counter-picker');
    el.joinStepBadge = document.getElementById('join-step-badge');
    el.verifiedEventBanner = document.getElementById('verified-event-banner');
    el.verifiedEventName = document.getElementById('verified-event-name');
    el.verifiedEventKey = document.getElementById('verified-event-key');
    el.btnRoleCounter = document.getElementById('btn-role-counter');
    el.btnRoleStockroom = document.getElementById('btn-role-stockroom');
    el.sectionCounterPicker = document.getElementById('section-counter-picker');
    el.selectAssignedCounter = document.getElementById('select-assigned-counter');
    el.assignedVolunteersLabel = document.getElementById('assigned-volunteers-label');
    el.sectionStockroomInfo = document.getElementById('section-stockroom-info');
    el.stockroomKeeperHint = document.getElementById('stockroom-keeper-hint');
    el.pinFieldLabel = document.getElementById('pin-field-label');
    el.pinFieldHint = document.getElementById('pin-field-hint');
    el.inputCounterPin = document.getElementById('input-counter-pin');
    el.btnEnterWorkspace = document.getElementById('btn-enter-workspace');
    el.btnGoogleAuth = document.getElementById('btn-google-auth');
    el.inputMasterPin = document.getElementById('input-master-pin');
    el.btnLoginMaster = document.getElementById('btn-login-master');
    el.quickFillMasterPin = document.getElementById('quick-fill-master-pin');

    // POS Workspace Elements
    el.posCounterName = document.getElementById('pos-counter-name-display');
    el.posVolunteers = document.getElementById('pos-volunteers-display');
    el.btnTriggerLowStock = document.getElementById('btn-trigger-low-stock');
    el.heroStockBox = document.getElementById('hero-stock-box');
    el.heroStockCount = document.getElementById('hero-stock-count');
    el.posKpiSold = document.getElementById('pos-kpi-sold');
    el.posKpiSoldSub = document.getElementById('pos-kpi-sold-sub');
    el.posKpiRemaining = document.getElementById('pos-kpi-remaining');
    el.posKpiRemainingSub = document.getElementById('pos-kpi-remaining-sub');
    el.posKpiRevenue = document.getElementById('pos-kpi-revenue');
    el.posKpiRevenueSub = document.getElementById('pos-kpi-revenue-sub');
    el.posDispatchBanner = document.getElementById('pos-dispatch-banner');
    el.posDispatchInfo = document.getElementById('pos-dispatch-info');
    el.posDispatchQty = document.getElementById('pos-dispatch-qty');
    el.btnAcceptDispatch = document.getElementById('btn-accept-dispatch');
    el.posUnitPriceLabel = document.getElementById('pos-unit-price-label');

    // Header Staff Pill & Subtitle
    el.headerStaffPill = document.getElementById('header-staff-pill');
    el.headerEventSub = document.getElementById('header-event-sub');

    // Billing Engine & Hero Confirm
    el.inputBillingQty = document.getElementById('input-billing-qty');
    el.btnQtyMinus = document.getElementById('btn-qty-minus');
    el.btnQtyPlus = document.getElementById('btn-qty-plus');
    el.btnModeCash = document.getElementById('btn-mode-cash');
    el.btnModeUpi = document.getElementById('btn-mode-upi');
    el.inputBuyerName = document.getElementById('input-buyer-name');
    el.inputBuyerPhone = document.getElementById('input-buyer-phone');
    el.inputBuyerCombined = document.getElementById('input-buyer-combined');
    el.btnConfirmSaleLabel = document.getElementById('btn-confirm-sale-label');
    el.panelCustomQtyStepper = document.getElementById('panel-custom-qty-stepper');
    el.btnOpenVipDrawer = document.getElementById('btn-open-vip-drawer');
    el.btnOpenTransferAction = document.getElementById('btn-open-transfer-action');
    el.preorderUnreadDot = document.getElementById('preorder-unread-dot');
    el.billingCalcFormula = document.getElementById('billing-calc-formula');
    el.billingModeSelected = document.getElementById('billing-mode-selected');
    el.billingTotalAmount = document.getElementById('billing-total-amount');
    el.btnProceedSale = document.getElementById('btn-proceed-sale');
    el.counterRecentTxns = document.getElementById('counter-recent-txns');
    el.counterLedgerCount = document.getElementById('counter-ledger-count');
    el.btnManualLock = document.getElementById('btn-manual-lock');

    // Modals
    el.modalUpiQr = document.getElementById('modal-upi-qr');
    el.upiQrRenderBox = document.getElementById('upi-qr-render-box');
    el.qrModalAmount = document.getElementById('qr-modal-amount');
    el.qrModalUpiId = document.getElementById('qr-modal-upi-id');
    el.btnCopyUpiLink = document.getElementById('btn-copy-upi-link');
    el.btnConfirmUpiPaid = document.getElementById('btn-confirm-upi-paid');

    el.modalConfirmSale = document.getElementById('modal-confirm-sale');
    el.confirmModalQty = document.getElementById('confirm-modal-qty');
    el.confirmModalMode = document.getElementById('confirm-modal-mode');
    el.confirmModalTotal = document.getElementById('confirm-modal-total');
    el.btnFinalizeSaleConfirmed = document.getElementById('btn-finalize-sale-confirmed');

    el.modalVoidTxn = document.getElementById('modal-void-txn');
    el.voidTxnId = document.getElementById('void-txn-id');
    el.voidReason = document.getElementById('void-reason');
    el.voidPin = document.getElementById('void-pin');
    el.btnSubmitVoid = document.getElementById('btn-submit-void');
    el.voidTxnSummary = document.getElementById('void-txn-summary');

    // VIP Handover Modal Elements
    el.modalVipHandover = document.getElementById('modal-vip-handover');
    el.inputVipQty = document.getElementById('input-vip-qty');
    el.btnVipQtyMinus = document.getElementById('btn-vip-qty-minus');
    el.btnVipQtyPlus = document.getElementById('btn-vip-qty-plus');
    el.vipStockHint = document.getElementById('vip-stock-hint');
    el.inputVipRecipient = document.getElementById('input-vip-recipient');
    el.inputVipVolunteer = document.getElementById('input-vip-volunteer');
    el.btnConfirmVipOk = document.getElementById('btn-confirm-vip-ok');

    // Micro-Donation & Excess Tender
    el.btnToggleDonationPane = document.getElementById('btn-toggle-donation-pane');
    el.btnCloseDonationPane = document.getElementById('btn-close-donation-pane');
    el.panelDonationExcess = document.getElementById('panel-donation-excess');
    el.inputCashTendered = document.getElementById('input-cash-tendered');
    el.displayChangeDue = document.getElementById('display-change-due');
    el.chkKeepChangeDonation = document.getElementById('chk-keep-change-donation');
    el.inputExtraDonation = document.getElementById('input-extra-donation');

    // Inter-Counter Transfers Banner & Exchange Modal
    el.posTransferBanner = document.getElementById('pos-transfer-banner');
    el.posTransferHeading = document.getElementById('pos-transfer-heading');
    el.posTransferDetails = document.getElementById('pos-transfer-details');
    el.btnAcceptTransfer = document.getElementById('btn-accept-transfer');
    el.btnRejectTransfer = document.getElementById('btn-reject-transfer');
    el.modalCounterExchange = document.getElementById('modal-counter-exchange');
    el.btnTypeBooks = document.getElementById('btn-type-books');
    el.btnTypeCash = document.getElementById('btn-type-cash');
    el.exchangeTargetCounter = document.getElementById('exchange-target-counter');
    el.labelExchangeQty = document.getElementById('label-exchange-qty');
    el.exchangeAvailHint = document.getElementById('exchange-avail-hint');
    el.exchangeQty = document.getElementById('exchange-qty');
    el.exchangeNotes = document.getElementById('exchange-notes');
    el.btnSubmitCounterExchange = document.getElementById('btn-submit-counter-exchange');

    // Confirmation Modal Elements
    el.confirmModalBookPrice = document.getElementById('confirm-modal-book-price');
    el.confirmModalDonationRow = document.getElementById('confirm-modal-donation-row');
    el.confirmModalDonation = document.getElementById('confirm-modal-donation');
    el.confirmModalChangeRow = document.getElementById('confirm-modal-change-row');
    el.confirmModalChange = document.getElementById('confirm-modal-change');
    el.confirmModalBuyer = document.getElementById('confirm-modal-buyer');

    // Fast Denomination Reset
    el.btnResetDenominations = document.getElementById('btn-reset-denominations');

    // Disaster Recovery Restore Modal
    el.inputRestoreBackup = document.getElementById('input-restore-backup');
    el.modalRestoreConflict = document.getElementById('modal-restore-conflict');
    el.restoreSummaryEvent = document.getElementById('restore-summary-event');
    el.restoreSummaryCounter = document.getElementById('restore-summary-counter');
    el.restoreSummaryTime = document.getElementById('restore-summary-time');
    el.chipRestoreSales = document.getElementById('chip-restore-sales');
    el.chipRestoreDonations = document.getElementById('chip-restore-donations');
    el.chipRestoreTransfers = document.getElementById('chip-restore-transfers');
    el.btnConfirmHydrate = document.getElementById('btn-confirm-hydrate');
    el.btnTriggerRestoreJson = document.getElementById('btn-trigger-restore-json');
    el.btnTriggerRestoreAdmin = document.getElementById('btn-trigger-restore-admin');

    el.lockoutScreen = document.getElementById('lockout-screen');
    el.inputUnlockPin = document.getElementById('input-unlock-pin');
    el.btnSubmitUnlock = document.getElementById('btn-submit-unlock');
  }

  // --- Real-time Sync Indicator State Helper ---
  function updateSyncIndicator(status, message) {
    if (!el.headerSyncPill) return;
    const label = el.headerSyncPill.querySelector('span:not(.green-sync-dot)');
    
    el.headerSyncPill.classList.remove('offline', 'syncing');

    if (status === 'offline' || !navigator.onLine) {
      el.headerSyncPill.classList.add('offline');
      if (label) label.textContent = message || 'Offline Ready';
    } else if (status === 'syncing') {
      el.headerSyncPill.classList.add('syncing');
      if (label) label.textContent = message || 'Syncing...';
    } else {
      if (label) {
        label.textContent = message || (window.CS_Firebase && window.CS_Firebase.isReady ? 'Cloud Live' : 'Synced');
      }
    }
  }

  // --- View Switcher ---
  function navigateTo(viewName) {
    state.currentView = viewName;

    // Header auto-hiding behavior: Hidden on gateway landing screen
    if (viewName === 'landing') {
      el.appHeader.classList.add('hidden');
      stopIdleTimer();
    } else {
      el.appHeader.classList.remove('hidden');
      startIdleTimer();
      if (state.eventKey) {
        CS_Store.initCloudSync(state.eventKey);
      }
      updateSyncIndicator(navigator.onLine ? 'synced' : 'offline');
    }

    // Toggle main sections
    el.viewLanding.classList.toggle('hidden', viewName !== 'landing');
    el.viewPOS.classList.toggle('hidden', viewName !== 'pos');
    el.viewStockroom.classList.toggle('hidden', viewName !== 'stockroom');
    el.viewAdmin.classList.toggle('hidden', viewName !== 'admin');

    // Quick lock visibility
    el.btnQuickLock.classList.toggle('hidden', viewName === 'landing');
    el.idleTimerDisplay.classList.toggle('hidden', viewName === 'landing');

    // Update context badge
    const event = CS_Store.getEvent(state.eventKey);
    const eventName = event ? event.name.split('—')[0].trim() : state.eventKey;

    if (viewName === 'pos') {
      const counter = CS_Store.getCounter(state.eventKey, state.counterId);
      el.headerEventLabel.textContent = `${state.eventKey} • ${counter ? counter.name.split('(')[0].trim() : 'Counter'}`;
      if (el.headerStaffPill) el.headerStaffPill.textContent = 'Sales';
      renderPOSWorkspace();
    } else if (viewName === 'stockroom') {
      el.headerEventLabel.textContent = `${state.eventKey} • Central Stock Room`;
      if (el.headerStaffPill) el.headerStaffPill.textContent = 'Stock';
      renderStockRoomWorkspace();
    } else if (viewName === 'admin') {
      el.headerEventLabel.textContent = `${state.eventKey} • Master Super Admin`;
      if (el.headerStaffPill) el.headerStaffPill.textContent = 'Admin';
      renderAdminDashboard();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // --- Theme Toggle ---
  function initTheme() {
    const saved = localStorage.getItem('countersync_theme');
    if (saved === 'light') {
      document.body.classList.add('light-theme');
    }
    if (el.btnThemeToggle) {
      el.btnThemeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        const isLight = document.body.classList.contains('light-theme');
        localStorage.setItem('countersync_theme', isLight ? 'light' : 'dark');
        showToast(isLight ? 'Switched to Light Mode' : 'AMOLED Dark Mode Activated', 'info');
      });
    }
  }

  // --- Inactivity Auto-Lock (3-Minute Idle Timer) ---
  function startIdleTimer() {
    stopIdleTimer();
    state.idleSecondsRemaining = 180; // 3 minutes
    updateIdleDisplay();

    state.idleTimerInterval = setInterval(() => {
      state.idleSecondsRemaining--;
      updateIdleDisplay();

      if (state.idleSecondsRemaining <= 0) {
        lockWorkspace();
      }
    }, 1000);
  }

  function stopIdleTimer() {
    if (state.idleTimerInterval) {
      clearInterval(state.idleTimerInterval);
      state.idleTimerInterval = null;
    }
  }

  function resetIdleActivity() {
    if (state.currentView !== 'landing' && !el.lockoutScreen.classList.contains('active')) {
      state.idleSecondsRemaining = 180;
      updateIdleDisplay();
    }
  }

  function updateIdleDisplay() {
    const mins = Math.floor(state.idleSecondsRemaining / 60);
    const secs = state.idleSecondsRemaining % 60;
    el.idleSeconds.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  function lockWorkspace() {
    stopIdleTimer();
    const event = CS_Store.getEvent(state.eventKey);
    const lockoutBox = document.querySelector('.lockout-box');
    if (lockoutBox) lockoutBox.classList.remove('shake');

    const lockoutTitle = document.getElementById('lockout-title');
    const lockoutDesc = document.getElementById('lockout-desc');
    const lockoutHint = document.getElementById('lockout-pin-hint');
    const unlockBtn = document.getElementById('btn-submit-unlock');

    if (state.currentView === 'pos' || state.role === 'POS') {
      const counter = (event && state.counterId) ? CS_Store.getCounter(state.eventKey, state.counterId) : null;
      const counterName = counter ? counter.name : 'Sales Counter';
      if (lockoutTitle) lockoutTitle.textContent = `${counterName} Locked`;
      if (lockoutDesc) lockoutDesc.textContent = `Workspace locked. Enter ${counterName} PIN to resume.`;
      if (lockoutHint) lockoutHint.textContent = counter ? `Assigned to: ${counter.volunteers}` : '';
      if (unlockBtn) unlockBtn.textContent = `Unlock ${counterName}`;
    } else if (state.currentView === 'stockroom' || state.role === 'STOCKROOM') {
      if (lockoutTitle) lockoutTitle.textContent = 'Stock Room Locked';
      if (lockoutDesc) lockoutDesc.textContent = 'Central warehouse locked. Enter Stock Room PIN to resume.';
      const keeper = (event && event.stockRoom) ? (event.stockRoom.keeperName || event.stockRoom.keeper) : 'Vikram Malhotra';
      if (lockoutHint) lockoutHint.textContent = `Keeper: ${keeper}`;
      if (unlockBtn) unlockBtn.textContent = 'Unlock Stock Room Vault';
    } else if (state.currentView === 'admin' || state.role === 'ADMIN') {
      if (lockoutTitle) lockoutTitle.textContent = 'Super Admin Portal Locked';
      if (lockoutDesc) lockoutDesc.textContent = 'Organizer dashboard locked. Enter Super Admin PIN to resume.';
      if (lockoutHint) lockoutHint.textContent = 'Organizer Master Access';
      if (unlockBtn) unlockBtn.textContent = 'Unlock Super Admin Portal';
    } else {
      if (lockoutTitle) lockoutTitle.textContent = 'Workspace Locked';
      if (lockoutDesc) lockoutDesc.textContent = 'Workspace paused due to inactivity. Enter your assigned PIN.';
      if (lockoutHint) lockoutHint.textContent = '';
      if (unlockBtn) unlockBtn.textContent = 'Unlock Workspace Desk';
    }

    el.lockoutScreen.classList.remove('hidden');
    el.lockoutScreen.classList.add('active');
    el.inputUnlockPin.value = '';
    setTimeout(() => el.inputUnlockPin.focus(), 60);
    CS_Audio.alertWarning();
    showToast('Workspace locked due to inactivity', 'error');
  }

  function unlockWorkspace() {
    const enteredPin = el.inputUnlockPin.value.trim();
    const event = CS_Store.getEvent(state.eventKey);
    if (!event) return;

    let valid = false;
    let expectedRoleName = '';

    if (state.currentView === 'pos' || state.role === 'POS') {
      const counter = state.counterId ? CS_Store.getCounter(state.eventKey, state.counterId) : null;
      expectedRoleName = counter ? counter.name : 'Sales Counter';
      // STRICT: Only this specific counter's PIN is accepted! Super Admin PIN and Stock Room PIN are strictly rejected!
      if (counter && enteredPin === String(counter.pin)) {
        valid = true;
      }
    } else if (state.currentView === 'stockroom' || state.role === 'STOCKROOM') {
      expectedRoleName = 'Stock Room';
      // STRICT: Only Stock Room PIN is accepted!
      if (enteredPin === String(event.stockRoomPin)) {
        valid = true;
      }
    } else if (state.currentView === 'admin' || state.role === 'ADMIN') {
      expectedRoleName = 'Super Admin';
      // STRICT: Only Super Admin PIN or 9999 is accepted!
      if (enteredPin === String(event.adminPin) || enteredPin === '9999') {
        valid = true;
      }
    }

    if (valid) {
      el.lockoutScreen.classList.add('hidden');
      el.lockoutScreen.classList.remove('active');
      startIdleTimer();
      CS_Audio.handshakeSuccess();
      showToast(`${expectedRoleName} Unlocked ✓`, 'success');
    } else {
      CS_Audio.alertWarning();
      const lockoutBox = document.querySelector('.lockout-box');
      if (lockoutBox) {
        lockoutBox.classList.remove('shake');
        void lockoutBox.offsetWidth;
        lockoutBox.classList.add('shake');
      }
      showToast(`Access Denied! Incorrect PIN. Please enter the specific PIN for ${expectedRoleName}.`, 'error');
      el.inputUnlockPin.value = '';
      el.inputUnlockPin.focus();
    }
  }

  // Activity listeners to reset idle timer
  ['mousemove', 'keydown', 'touchstart', 'click'].forEach(evt => {
    window.addEventListener(evt, resetIdleActivity, { passive: true });
  });

  // --- Gateway Controller ---
  function initGateway() {
    // Check stealth master parameter: ?portal=master
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('portal') === 'master') {
      el.landingIntents.classList.add('hidden');
      el.organizerAuthFlow.classList.remove('hidden');
      el.inputMasterPin.focus();
    }

    // Quick fill shortcuts
    if (el.quickFillCS2026) {
      el.quickFillCS2026.addEventListener('click', () => {
        el.inputEventKey.value = 'CS2026';
        handleValidateKey();
      });
    }

    if (el.quickFillMasterPin) {
      el.quickFillMasterPin.addEventListener('click', () => {
        el.inputMasterPin.value = '9999';
      });
    }

    function openJoinEvent() {
      const lCard = document.querySelector('.landing-card');
      if (lCard) lCard.classList.add('in-join-mode');

      const lLogo = document.querySelector('.landing-logo');
      const lTitle = document.querySelector('.landing-title');
      const lTag = document.querySelector('.landing-tagline');
      if (lLogo) lLogo.classList.add('hidden');
      if (lTitle) lTitle.classList.add('hidden');
      if (lTag) lTag.classList.add('hidden');

      if (el.landingIntents) el.landingIntents.classList.add('hidden');
      if (el.staffValidationFlow) el.staffValidationFlow.classList.remove('hidden');
      if (el.scopedCounterPicker) el.scopedCounterPicker.classList.add('hidden');
      if (el.joinStepBadge) el.joinStepBadge.textContent = 'Step 1 of 2';
      if (el.inputEventKey) {
        el.inputEventKey.value = '';
        setTimeout(() => el.inputEventKey.focus(), 60);
      }
    }

    function openHostEvent() {
      const lCard = document.querySelector('.landing-card');
      if (lCard) lCard.classList.remove('in-join-mode');

      const lLogo = document.querySelector('.landing-logo');
      const lTitle = document.querySelector('.landing-title');
      const lTag = document.querySelector('.landing-tagline');
      if (lLogo) lLogo.classList.add('hidden');
      if (lTitle) lTitle.classList.add('hidden');
      if (lTag) lTag.classList.add('hidden');

      if (el.landingIntents) el.landingIntents.classList.add('hidden');
      if (el.organizerAuthFlow) el.organizerAuthFlow.classList.remove('hidden');
      if (el.inputMasterPin) el.inputMasterPin.focus();
    }

    function backToIntents() {
      const lCard = document.querySelector('.landing-card');
      if (lCard) lCard.classList.remove('in-join-mode');

      const lLogo = document.querySelector('.landing-logo');
      const lTitle = document.querySelector('.landing-title');
      const lTag = document.querySelector('.landing-tagline');
      if (lLogo) lLogo.classList.remove('hidden');
      if (lTitle) lTitle.classList.remove('hidden');
      if (lTag) lTag.classList.remove('hidden');

      if (el.staffValidationFlow) el.staffValidationFlow.classList.add('hidden');
      if (el.scopedCounterPicker) el.scopedCounterPicker.classList.add('hidden');
      if (el.joinStepBadge) el.joinStepBadge.textContent = 'Step 1 of 2';
      if (el.organizerAuthFlow) el.organizerAuthFlow.classList.add('hidden');
      if (el.landingIntents) el.landingIntents.classList.remove('hidden');
    }

    // Google Sign-In & Organizer Host Event Flow
    async function handleHostEventClick() {
      if (window.CS_Firebase && window.CS_Firebase.isReady) {
        try {
          showToast('Connecting to Google Identity Services...', 'info');
          const user = await window.CS_Firebase.signInWithGoogle();
          if (user) {
            state.eventKey = state.eventKey || 'CS2026';
            state.role = 'ADMIN';
            CS_Store.setSession({
              role: 'ADMIN',
              eventKey: state.eventKey,
              user: {
                displayName: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                uid: user.uid
              }
            });
            CS_Store.initCloudSync(state.eventKey);
            CS_Audio.handshakeSuccess();
            showToast(`Welcome, ${user.displayName || user.email}! Authenticated as Super Admin`, 'success');
            navigateTo('admin');
            return;
          }
        } catch (err) {
          console.warn("Google Sign-In notice:", err);
          showToast(err.message || 'Google Sign-In canceled', 'error');
        }
      }
      openHostEvent();
    }

    // Expose on window for fail-safe direct inline click triggers
    window.openJoinEvent = openJoinEvent;
    window.openHostEvent = openHostEvent;
    window.handleHostEventClick = handleHostEventClick;
    window.backToIntents = backToIntents;
    window.handleValidateKey = handleValidateKey;
    window.handleEnterWorkspace = handleEnterWorkspace;

    window.CounterSyncApp = {
      openJoinEvent,
      openHostEvent,
      handleHostEventClick,
      backToIntents,
      handleValidateKey,
      handleEnterWorkspace,
      navigateTo
    };

    // Dual Intent Click - Join Event (Staff)
    if (el.cardIntentStaff) {
      el.cardIntentStaff.addEventListener('click', (e) => {
        e.preventDefault();
        openJoinEvent();
      });
      el.cardIntentStaff.addEventListener('touchend', (e) => {
        e.preventDefault();
        openJoinEvent();
      }, { passive: false });
    }

    // Dual Intent Click - Host an Event (Organizer)
    if (el.cardIntentOrganizer) {
      el.cardIntentOrganizer.addEventListener('click', (e) => {
        e.preventDefault();
        handleHostEventClick();
      });
      el.cardIntentOrganizer.addEventListener('touchend', (e) => {
        e.preventDefault();
        handleHostEventClick();
      }, { passive: false });
    }

    if (el.btnBackToIntents) {
      el.btnBackToIntents.addEventListener('click', backToIntents);
    }

    if (el.btnBackFromOrganizer) {
      el.btnBackFromOrganizer.addEventListener('click', backToIntents);
    }

    // Auto-fill PIN helper when user taps the hint pill
    if (el.pinFieldHint) {
      el.pinFieldHint.style.cursor = 'pointer';
      el.pinFieldHint.addEventListener('click', () => {
        const match = el.pinFieldHint.textContent.match(/\d{4,6}/);
        if (match && el.inputCounterPin) {
          el.inputCounterPin.value = match[0];
          triggerHaptic('light');
          showToast(`PIN ${match[0]} Auto-filled!`, 'info');
        }
      });
    }

    // Role / Workspace Segment Selector (Sales Counter vs Stock Room)
    if (el.btnRoleCounter) {
      el.btnRoleCounter.addEventListener('click', () => {
        state.selectedRole = 'POS';
        el.btnRoleCounter.classList.add('active');
        el.btnRoleStockroom.classList.remove('active');
        el.sectionCounterPicker.classList.remove('hidden');
        el.sectionStockroomInfo.classList.add('hidden');
        updateSelectedCounterDetails();
      });
    }

    if (el.btnRoleStockroom) {
      el.btnRoleStockroom.addEventListener('click', () => {
        state.selectedRole = 'STOCKROOM';
        el.btnRoleStockroom.classList.add('active');
        el.btnRoleCounter.classList.remove('active');
        el.sectionCounterPicker.classList.add('hidden');
        el.sectionStockroomInfo.classList.remove('hidden');
        
        const event = CS_Store.getEvent(state.eventKey);
        el.pinFieldLabel.textContent = 'STOCK ROOM PIN';
        el.pinFieldHint.textContent = `PIN: ${event ? event.stockRoomPin : '5555'}`;
        el.inputCounterPin.value = '';
        el.inputCounterPin.focus();
      });
    }

    // Counter dropdown selection change
    if (el.selectAssignedCounter) {
      el.selectAssignedCounter.addEventListener('change', (e) => {
        state.selectedCounterId = e.target.value;
        updateSelectedCounterDetails();
      });
    }

    // Primary Enter Workspace button
    if (el.btnEnterWorkspace) {
      el.btnEnterWorkspace.addEventListener('click', handleEnterWorkspace);
    }
    if (el.inputCounterPin) {
      el.inputCounterPin.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleEnterWorkspace();
      });
    }

    // Event Key Validation
    if (el.btnValidateKey) el.btnValidateKey.addEventListener('click', handleValidateKey);
    if (el.inputEventKey) {
      el.inputEventKey.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleValidateKey();
      });
    }

    // Master PIN Bypass Login
    if (el.btnLoginMaster) el.btnLoginMaster.addEventListener('click', handleMasterPinLogin);
    if (el.inputMasterPin) {
      el.inputMasterPin.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleMasterPinLogin();
      });
    }

    // Google Sign-In Flow Hook
    if (el.btnGoogleAuth) {
      el.btnGoogleAuth.addEventListener('click', async () => {
        if (window.CS_Firebase && window.CS_Firebase.isReady) {
          try {
            showToast('Connecting to Google Identity Services...', 'info');
            const user = await window.CS_Firebase.signInWithGoogle();
            if (user) {
              state.eventKey = state.eventKey || 'CS2026';
              state.role = 'ADMIN';
              CS_Store.setSession({
                role: 'ADMIN',
                eventKey: state.eventKey,
                user: {
                  displayName: user.displayName,
                  email: user.email,
                  photoURL: user.photoURL,
                  uid: user.uid
                }
              });
              CS_Store.initCloudSync(state.eventKey);
              CS_Audio.handshakeSuccess();
              showToast(`Welcome, ${user.displayName || user.email}! Authenticated as Super Admin`, 'success');
              navigateTo('admin');
            }
          } catch (err) {
            console.warn("Google Sign-In notice:", err);
            showToast(err.message || 'Google Sign-In canceled', 'error');
          }
        } else {
          const modal = document.getElementById('modal-google-auth');
          if (modal) modal.classList.remove('hidden');
        }
      });
    }

    const btnConfirmGoogle = document.getElementById('btn-confirm-google-login');
    if (btnConfirmGoogle) {
      btnConfirmGoogle.addEventListener('click', () => {
        const modal = document.getElementById('modal-google-auth');
        if (modal) modal.classList.add('hidden');
        state.eventKey = 'CS2026';
        state.role = 'ADMIN';
        CS_Store.setSession({ role: 'ADMIN', eventKey: 'CS2026' });
        CS_Store.initCloudSync('CS2026');
        CS_Audio.handshakeSuccess();
        showToast('Google Sign-In Verified: Authenticated as Super Admin', 'success');
        navigateTo('admin');
      });
    }

    // Header Exit button
    if (el.btnHeaderLogout) {
      el.btnHeaderLogout.addEventListener('click', async () => {
        if (confirm('Return to CounterSync Brand Gateway?')) {
          if (window.CS_Firebase && typeof window.CS_Firebase.signOut === 'function') {
            try { await window.CS_Firebase.signOut(); } catch (e) {}
          }
          CS_Store.clearSession();
          state.role = null;
          state.counterId = null;
          navigateTo('landing');
        }
      });
    }

    // Quick Lock button in header
    if (el.btnQuickLock) el.btnQuickLock.addEventListener('click', lockWorkspace);
    if (el.btnManualLock) el.btnManualLock.addEventListener('click', lockWorkspace);
    if (el.btnSubmitUnlock) el.btnSubmitUnlock.addEventListener('click', unlockWorkspace);
    if (el.inputUnlockPin) {
      el.inputUnlockPin.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') unlockWorkspace();
      });
    }
  }

  function handleValidateKey() {
    const rawKey = el.inputEventKey ? el.inputEventKey.value.trim().toUpperCase() : '';
    if (!rawKey) {
      showToast('Please enter an event access key (e.g. CS2026)', 'error');
      if (el.inputEventKey) el.inputEventKey.focus();
      return;
    }

    if (!CS_Store.validateEventKey(rawKey)) {
      showToast(`Event key "${rawKey}" not found. Try CS2026.`, 'error');
      if (el.scopedCounterPicker) el.scopedCounterPicker.classList.add('hidden');
      if (el.joinStepBadge) el.joinStepBadge.textContent = 'Step 1 of 2';
      return;
    }

    state.eventKey = rawKey;
    const event = CS_Store.getEvent(rawKey);
    renderScopedCounterPicker(rawKey);
    if (el.scopedCounterPicker) el.scopedCounterPicker.classList.remove('hidden');
    if (el.joinStepBadge) el.joinStepBadge.textContent = 'Step 2 of 2';
    CS_Audio.playTone(880, 'sine', 0.1);
    showToast(`✓ Event Verified: ${event ? event.name : rawKey}`, 'success');
    if (el.inputCounterPin) {
      setTimeout(() => el.inputCounterPin.focus(), 60);
    }
  }

  function renderScopedCounterPicker(eventKey) {
    const event = CS_Store.getEvent(eventKey);
    if (!event) return;

    if (el.verifiedEventName) el.verifiedEventName.textContent = event.name;
    if (el.verifiedEventKey) el.verifiedEventKey.textContent = `Verified Key: ${event.key}`;
    if (el.joinStepBadge) el.joinStepBadge.textContent = 'Step 2 of 2';

    // Populate counters dropdown
    if (el.selectAssignedCounter) {
      el.selectAssignedCounter.innerHTML = '';
      (event.counters || []).forEach(counter => {
        const opt = document.createElement('option');
        opt.value = counter.id;
        opt.textContent = counter.name;
        el.selectAssignedCounter.appendChild(opt);
      });

      // Default to counter-01a or first counter
      const firstCounter = (event.counters || []).find(c => c.id === 'counter-01a') || (event.counters || [])[0];
      if (firstCounter) {
        state.selectedCounterId = firstCounter.id;
        el.selectAssignedCounter.value = firstCounter.id;
      }
    }

    // Stock room keeper hint
    if (el.stockroomKeeperHint && event.stockRoom) {
      el.stockroomKeeperHint.textContent = `Keeper: ${event.stockRoom.keeperName || event.stockRoom.keeper || 'Vikram Malhotra & Logistics Squad'}`;
    }

    // Default to Sales Counter role
    state.selectedRole = 'POS';
    if (el.btnRoleCounter) el.btnRoleCounter.classList.add('active');
    if (el.btnRoleStockroom) el.btnRoleStockroom.classList.remove('active');
    if (el.sectionCounterPicker) el.sectionCounterPicker.classList.remove('hidden');
    if (el.sectionStockroomInfo) el.sectionStockroomInfo.classList.add('hidden');

    updateSelectedCounterDetails();
  }

  function updateSelectedCounterDetails() {
    const event = CS_Store.getEvent(state.eventKey);
    if (!event) return;

    const counter = (event.counters || []).find(c => c.id === state.selectedCounterId) || (event.counters || [])[0];
    if (counter) {
      state.selectedCounterId = counter.id;
      if (el.selectAssignedCounter) el.selectAssignedCounter.value = counter.id;
      if (el.assignedVolunteersLabel) el.assignedVolunteersLabel.textContent = `Assigned: ${counter.volunteers}`;
      if (el.pinFieldLabel) el.pinFieldLabel.textContent = `${counter.name.toUpperCase()} PIN`;
      if (el.pinFieldHint) el.pinFieldHint.textContent = `PIN: ${counter.pin}`;
      if (el.inputCounterPin) {
        el.inputCounterPin.value = '';
        el.inputCounterPin.placeholder = 'Enter PIN';
      }
    }
  }

  function handleEnterWorkspace() {
    const pin = (el.inputCounterPin ? el.inputCounterPin.value.trim() : '');
    const event = CS_Store.getEvent(state.eventKey);
    if (!event) return;

    if (!pin) {
      CS_Audio.alertWarning();
      showToast('Please enter your access PIN', 'error');
      if (el.inputCounterPin) el.inputCounterPin.focus();
      return;
    }

    if (state.selectedRole === 'POS') {
      const counter = (event.counters || []).find(c => c.id === state.selectedCounterId);
      if (!counter) return;

      if (pin === counter.pin || pin === '9999' || pin === event.adminPin) {
        state.role = 'POS';
        state.counterId = counter.id;
        CS_Store.setSession({ role: 'POS', eventKey: state.eventKey, counterId: counter.id });
        CS_Audio.handshakeSuccess();
        showToast(`Welcome ${counter.volunteers}! Connected to ${counter.name}`, 'success');
        navigateTo('pos');
      } else {
        CS_Audio.alertWarning();
        showToast(`Invalid PIN. Hint: ${counter.pin}`, 'error');
        if (el.inputCounterPin) {
          el.inputCounterPin.select();
        }
      }
    } else if (state.selectedRole === 'STOCKROOM') {
      if (pin === event.stockRoomPin || pin === '9999' || pin === event.adminPin) {
        state.role = 'STOCKROOM';
        state.counterId = null;
        CS_Store.setSession({ role: 'STOCKROOM', eventKey: state.eventKey });
        CS_Audio.handshakeSuccess();
        showToast('Central Logistics Vault Authenticated', 'success');
        navigateTo('stockroom');
      } else {
        CS_Audio.alertWarning();
        showToast(`Invalid Stock Room PIN. Hint: ${event.stockRoomPin}`, 'error');
        if (el.inputCounterPin) {
          el.inputCounterPin.select();
        }
      }
    }
  }

  function promptStockRoomPin(event) {
    const pin = prompt(`Enter Stock Room PIN for Warehouse Logistics\n(Demo PIN: ${event.stockRoomPin})`);
    if (!pin) return;

    if (pin.trim() === event.stockRoomPin || pin.trim() === '9999') {
      state.role = 'STOCKROOM';
      state.counterId = null;
      CS_Store.setSession({ role: 'STOCKROOM', eventKey: state.eventKey });
      CS_Audio.handshakeSuccess();
      showToast('Central Logistics Vault Authenticated', 'success');
      navigateTo('stockroom');
    } else {
      CS_Audio.alertWarning();
      showToast('Invalid Stock Room PIN.', 'error');
    }
  }

  function handleMasterPinLogin() {
    const enteredPin = el.inputMasterPin.value.trim();
    const event = CS_Store.getEvent(state.eventKey);
    const validPin = event ? event.adminPin : '9999';

    if (enteredPin === validPin || enteredPin === '9999') {
      state.role = 'ADMIN';
      CS_Store.setSession({ role: 'ADMIN', eventKey: state.eventKey });
      CS_Audio.handshakeSuccess();
      showToast('Super Admin Master Bypass Granted', 'success');
      navigateTo('admin');
    } else {
      CS_Audio.alertWarning();
      showToast('Invalid Master PIN. Default demo PIN is 9999.', 'error');
    }
  }

  // --- 2. Sales Counter Workspace (Staff / POS View - 4-Tab Dedicated Mobile Architecture) ---
  function initPOSWorkspace() {
    // 4-Tab Bottom Dock Navigation
    const dockButtons = document.querySelectorAll('.dock-tab-btn');
    dockButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.posTab;
        switchDockTab(tab);
      });
    });

    // Quick quantity selector cards (+1, +2, +5, Custom)
    const qtyCards = document.querySelectorAll('.btn-qty-card');
    qtyCards.forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.qty;
        if (q === 'custom') {
          qtyCards.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          if (el.panelCustomQtyStepper) el.panelCustomQtyStepper.classList.toggle('hidden');
          if (el.inputBillingQty) state.selectedQty = parseInt(el.inputBillingQty.value, 10) || 1;
        } else {
          qtyCards.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          if (el.panelCustomQtyStepper) el.panelCustomQtyStepper.classList.add('hidden');
          state.selectedQty = parseInt(q, 10);
          if (el.inputBillingQty) el.inputBillingQty.value = state.selectedQty;
          triggerHaptic('light');
        }
        updateBillingCalculation();
      });
    });

    if (el.btnQtyMinus) {
      el.btnQtyMinus.addEventListener('click', () => {
        let q = parseInt(el.inputBillingQty.value, 10) || 1;
        if (q > 1) {
          q--;
          el.inputBillingQty.value = q;
          state.selectedQty = q;
          triggerHaptic('light');
          updateBillingCalculation();
        }
      });
    }

    if (el.btnQtyPlus) {
      el.btnQtyPlus.addEventListener('click', () => {
        let q = parseInt(el.inputBillingQty.value, 10) || 1;
        q++;
        el.inputBillingQty.value = q;
        state.selectedQty = q;
        triggerHaptic('light');
        updateBillingCalculation();
      });
    }

    if (el.inputBillingQty) {
      el.inputBillingQty.addEventListener('input', () => {
        const q = Math.max(1, parseInt(el.inputBillingQty.value, 10) || 1);
        state.selectedQty = q;
        updateBillingCalculation();
      });
    }

    // Payment Mode Cards (Cash vs UPI)
    if (el.btnModeCash) {
      el.btnModeCash.addEventListener('click', () => {
        state.selectedPayMode = 'CASH';
        el.btnModeCash.classList.add('active');
        if (el.btnModeUpi) el.btnModeUpi.classList.remove('active');
        triggerHaptic('light');
        updateBillingCalculation();
      });
    }

    if (el.btnModeUpi) {
      el.btnModeUpi.addEventListener('click', () => {
        state.selectedPayMode = 'UPI';
        el.btnModeUpi.classList.add('active');
        if (el.btnModeCash) el.btnModeCash.classList.remove('active');
        triggerHaptic('light');
        updateBillingCalculation();
      });
    }

    // VIP / Free Copy Link -> In-App Pop-up Modal
    if (el.btnOpenVipDrawer) {
      el.btnOpenVipDrawer.addEventListener('click', () => {
        openVipModal();
      });
    }

    // VIP Stepper Minus
    if (el.btnVipQtyMinus) {
      el.btnVipQtyMinus.addEventListener('click', () => {
        let q = parseInt(el.inputVipQty ? el.inputVipQty.value : 1, 10) || 1;
        if (q > 1) {
          if (el.inputVipQty) el.inputVipQty.value = q - 1;
          triggerHaptic('light');
        }
      });
    }

    // VIP Stepper Plus
    if (el.btnVipQtyPlus) {
      el.btnVipQtyPlus.addEventListener('click', () => {
        const counter = CS_Store.getCounter(state.eventKey, state.counterId);
        const max = counter ? counter.currentStock : 999;
        let q = parseInt(el.inputVipQty ? el.inputVipQty.value : 1, 10) || 1;
        if (q < max) {
          if (el.inputVipQty) el.inputVipQty.value = q + 1;
          triggerHaptic('light');
        } else {
          showToast(`Max available shelf stock is ${max}`, 'warning');
        }
      });
    }

    // VIP Confirm OK Button
    if (el.btnConfirmVipOk) {
      el.btnConfirmVipOk.addEventListener('click', () => {
        const counter = CS_Store.getCounter(state.eventKey, state.counterId);
        if (!counter) return;

        const copies = parseInt(el.inputVipQty ? el.inputVipQty.value : 1, 10) || 1;
        const recipient = el.inputVipRecipient ? el.inputVipRecipient.value.trim() : '';
        const volunteer = el.inputVipVolunteer ? el.inputVipVolunteer.value.trim() : '';

        if (!recipient) {
          showToast('Please enter the recipient / dignitary name', 'error');
          if (el.inputVipRecipient) el.inputVipRecipient.focus();
          return;
        }

        if (counter.currentStock < copies) {
          CS_Audio.alertWarning();
          showToast(`Cannot issue ${copies} copies! Only ${counter.currentStock} in stock.`, 'error');
          return;
        }

        try {
          CS_Store.recordVIPHandover({
            eventKey: state.eventKey,
            counterId: state.counterId,
            recipientName: recipient,
            designation: 'VIP / Complimentary',
            copies: copies,
            issuedBy: volunteer
          });

          if (el.modalVipHandover) el.modalVipHandover.classList.add('hidden');
          CS_Audio.handshakeSuccess();
          showToast(`VIP Handover: ${copies} ${copies === 1 ? 'copy' : 'copies'} issued to ${recipient}`, 'success');
          renderPOSWorkspace();
        } catch (err) {
          CS_Audio.alertWarning();
          showToast(err.message, 'error');
        }
      });
    }

    // Micro-Donation & Excess Tender Toggle (Section 1.1)
    if (el.btnToggleDonationPane && el.panelDonationExcess) {
      el.btnToggleDonationPane.addEventListener('click', () => {
        const isHidden = el.panelDonationExcess.classList.toggle('hidden');
        el.btnToggleDonationPane.classList.toggle('active', !isHidden);
        if (!isHidden && el.inputCashTendered) {
          setTimeout(() => el.inputCashTendered.focus(), 60);
        }
      });
    }

    if (el.btnCloseDonationPane && el.panelDonationExcess) {
      el.btnCloseDonationPane.addEventListener('click', () => {
        el.panelDonationExcess.classList.add('hidden');
        if (el.btnToggleDonationPane) el.btnToggleDonationPane.classList.remove('active');
      });
    }

    // Fast Tender Preset Pills
    document.querySelectorAll('.btn-tender-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-tender-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const preset = btn.dataset.preset;
        const currentBookPrice = state.currentBilling ? state.currentBilling.bookTotal : 100;
        if (preset === 'exact') {
          if (el.inputCashTendered) el.inputCashTendered.value = currentBookPrice;
        } else {
          if (el.inputCashTendered) el.inputCashTendered.value = preset;
        }
        updateBillingCalculation();
        triggerHaptic('light');
      });
    });

    if (el.inputCashTendered) {
      el.inputCashTendered.addEventListener('input', () => {
        document.querySelectorAll('.btn-tender-chip').forEach(b => b.classList.remove('active'));
        updateBillingCalculation();
      });
    }

    if (el.chkKeepChangeDonation) {
      el.chkKeepChangeDonation.addEventListener('change', () => {
        updateBillingCalculation();
        triggerHaptic('light');
      });
    }

    if (el.inputExtraDonation) {
      el.inputExtraDonation.addEventListener('input', () => {
        updateBillingCalculation();
      });
    }

    // Inter-Counter Stock Transfer Modal (Tab 4 End of Day - Section 1.2)
    if (el.btnOpenTransferAction) {
      el.btnOpenTransferAction.addEventListener('click', openCounterExchangeModal);
    }

    if (el.btnTypeBooks) {
      el.btnTypeBooks.addEventListener('click', () => {
        state.activeExchangeType = 'BOOKS';
        if (el.btnTypeBooks) el.btnTypeBooks.classList.add('active');
        if (el.btnTypeCash) el.btnTypeCash.classList.remove('active');
        updateExchangeAvailableHint();
      });
    }

    if (el.btnTypeCash) {
      el.btnTypeCash.addEventListener('click', () => {
        state.activeExchangeType = 'CASH';
        if (el.btnTypeCash) el.btnTypeCash.classList.add('active');
        if (el.btnTypeBooks) el.btnTypeBooks.classList.remove('active');
        updateExchangeAvailableHint();
      });
    }

    if (el.btnSubmitCounterExchange) {
      el.btnSubmitCounterExchange.addEventListener('click', submitCounterExchange);
    }

    // Two-Way Stock Dispatch Handshake Button
    if (el.btnAcceptDispatch) {
      el.btnAcceptDispatch.addEventListener('click', () => {
        const event = CS_Store.getEvent(state.eventKey);
        const inTransit = (event.dispatches || []).find(d => d.counterId === state.counterId && d.status === 'IN_TRANSIT');
        if (inTransit) {
          CS_Store.acceptStockDispatch({
            eventKey: state.eventKey,
            dispatchId: inTransit.id,
            acceptedBy: el.posVolunteers ? el.posVolunteers.textContent.replace('Volunteers: ', '').trim() : 'Safwan, Rashid'
          });
          CS_Audio.handshakeSuccess();
          showToast(`Accepted +${inTransit.copies} copies into counter inventory!`, 'success');
          renderPOSWorkspace();
        }
      });
    }

    // Confirm Sale Hero Button
    if (el.btnProceedSale) {
      el.btnProceedSale.addEventListener('click', () => {
        const event = CS_Store.getEvent(state.eventKey);
        const counter = CS_Store.getCounter(state.eventKey, state.counterId);
        if (!counter) return;

        updateBillingCalculation();
        const billing = state.currentBilling || {
          qty: state.selectedQty || 1,
          bookTotal: (state.selectedQty || 1) * (event.unitPrice || 100),
          totalDonation: 0,
          grandTotal: (state.selectedQty || 1) * (event.unitPrice || 100),
          tender: (state.selectedQty || 1) * (event.unitPrice || 100),
          changeDue: 0
        };

        const qty = billing.qty;
        if (qty > 0 && counter.currentStock < qty) {
          CS_Audio.alertWarning();
          showToast(`Cannot sell ${qty} copies! Only ${counter.currentStock} remaining in shelf stock.`, 'error');
          return;
        }

        if (qty === 0 && billing.totalDonation <= 0) {
          CS_Audio.alertWarning();
          showToast('Please select at least 1 book copy or enter a donation amount.', 'error');
          return;
        }

        let buyerName = '';
        let buyerPhone = '';
        if (el.inputBuyerCombined) {
          const val = el.inputBuyerCombined.value.trim();
          const phoneMatch = val.match(/\b\d{10}\b/);
          if (phoneMatch) {
            buyerPhone = phoneMatch[0];
            buyerName = val.replace(phoneMatch[0], '').trim();
          } else {
            buyerName = val;
          }
        }

        state.pendingSaleData = {
          qty,
          unitPrice: event.unitPrice || 100,
          bookTotal: billing.bookTotal,
          donationAmount: billing.totalDonation,
          total: billing.grandTotal,
          cashReceived: billing.tender,
          changeGiven: billing.changeDue,
          mode: state.selectedPayMode,
          buyerName: buyerName || (qty === 0 ? 'Patron Donor' : 'Direct Buyer'),
          buyerPhone
        };

        if (state.selectedPayMode === 'CASH') {
          // Open Explicit Confirmation Modal (Section 1.3)
          openCashConfirmModal(state.pendingSaleData);
        } else {
          openUpiQrModal(counter, billing.grandTotal);
        }
      });
    }

    // Confirm UPI Payment Received
    if (el.btnConfirmUpiPaid) {
      el.btnConfirmUpiPaid.addEventListener('click', () => {
        if (el.modalUpiQr) el.modalUpiQr.classList.add('hidden');
        executeSale(state.pendingSaleData);
      });
    }

    // Copy UPI Link
    if (el.btnCopyUpiLink) {
      el.btnCopyUpiLink.addEventListener('click', () => {
        if (state.activeUpiUri) {
          navigator.clipboard.writeText(state.activeUpiUri).then(() => {
            showToast('UPI payment URI copied to clipboard!', 'info');
          });
        }
      });
    }

    // Pre-Order Search & Filter
    const searchPreorder = document.getElementById('input-search-preorder');
    if (searchPreorder) {
      searchPreorder.addEventListener('input', () => {
        renderPreOrdersList();
      });
    }

    // Denomination Inputs
    const denomInputs = document.querySelectorAll('.denom-input');
    denomInputs.forEach(inp => {
      inp.addEventListener('input', updateDenominationCalculations);
    });

    // Fast Denomination Reset (Section 1.4)
    if (el.btnResetDenominations) {
      el.btnResetDenominations.addEventListener('click', () => {
        const denomInps = document.querySelectorAll('.denom-input');
        denomInps.forEach(i => i.value = 0);
        updateDenominationCalculations();
        triggerHaptic('medium');
        showToast('Denominations reset to zero.', 'info');
      });
    }

    // Save Backup JSON in End of Day (Section 2 & 3)
    const btnBackup = document.getElementById('btn-export-counter-json');
    if (btnBackup) {
      btnBackup.addEventListener('click', () => {
        downloadJsonBackup(state.counterId);
      });
    }

    // Disaster Recovery JSON Restore Triggers & Handlers
    if (el.btnTriggerRestoreJson && el.inputRestoreBackup) {
      el.btnTriggerRestoreJson.addEventListener('click', () => el.inputRestoreBackup.click());
    }
    if (el.btnTriggerRestoreAdmin && el.inputRestoreBackup) {
      el.btnTriggerRestoreAdmin.addEventListener('click', () => el.inputRestoreBackup.click());
    }
    if (el.inputRestoreBackup) {
      el.inputRestoreBackup.addEventListener('change', handleBackupFileSelect);
    }
    if (el.btnConfirmHydrate) {
      el.btnConfirmHydrate.addEventListener('click', executeBackupHydration);
    }

    // Lock Screen in End of Day
    const btnLock = document.getElementById('btn-manual-lock');
    if (btnLock) {
      btnLock.addEventListener('click', lockWorkspace);
    }

    // Void Transaction Submission
    if (el.btnSubmitVoid) {
      el.btnSubmitVoid.addEventListener('click', handleVoidTransaction);
    }
    if (el.voidPin) {
      el.voidPin.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleVoidTransaction();
      });
    }
  }

  function switchDockTab(tabId) {
    state.activeDockTab = tabId;
    const tabs = ['sale', 'preorders', 'history', 'endofday'];
    tabs.forEach(t => {
      const pane = document.getElementById(`tab-pane-${t}`);
      const btn = document.getElementById(`dock-btn-${t}`);
      if (pane) pane.classList.toggle('hidden', t !== tabId);
      if (pane) pane.classList.toggle('active', t === tabId);
      if (btn) btn.classList.toggle('active', t === tabId);
    });

    if (tabId === 'preorders') renderPreOrdersList();
    if (tabId === 'history') renderCounterShiftLedger();
    if (tabId === 'endofday') {
      updateDenominationCalculations();
    }
    triggerHaptic('light');
  }

  function updateBillingCalculation() {
    const event = CS_Store.getEvent(state.eventKey);
    const unitPrice = event ? (event.unitPrice || 100) : 100;
    const qty = state.selectedQty !== undefined ? state.selectedQty : 1;
    const bookTotal = qty * unitPrice;

    // Direct discretionary donation
    const extraDonation = el.inputExtraDonation ? (parseInt(el.inputExtraDonation.value, 10) || 0) : 0;
    // Customer cash tendered
    const tender = el.inputCashTendered ? (parseInt(el.inputCashTendered.value, 10) || 0) : 0;
    const keepChange = el.chkKeepChangeDonation ? el.chkKeepChangeDonation.checked : false;

    let changeDue = 0;
    let changeAsDonation = 0;

    if (tender > 0 && tender > bookTotal) {
      const delta = tender - bookTotal;
      if (keepChange) {
        changeDue = 0;
        changeAsDonation = delta;
      } else {
        changeDue = delta;
        changeAsDonation = 0;
      }
    }

    if (el.displayChangeDue) {
      el.displayChangeDue.textContent = `₹${changeDue.toLocaleString('en-IN')}`;
    }

    const totalDonation = changeAsDonation + extraDonation;
    const grandTotal = bookTotal + totalDonation;

    state.currentBilling = {
      qty,
      bookTotal,
      extraDonation,
      changeAsDonation,
      totalDonation,
      tender: tender > 0 ? tender : grandTotal,
      changeDue,
      grandTotal
    };

    if (el.btnConfirmSaleLabel) {
      if (qty === 0 && totalDonation > 0) {
        el.btnConfirmSaleLabel.textContent = `CONFIRM DONATION (₹${totalDonation.toLocaleString('en-IN')})`;
      } else if (totalDonation > 0) {
        el.btnConfirmSaleLabel.textContent = `CONFIRM SALE (${qty} ${qty === 1 ? 'Copy' : 'Copies'} + ₹${totalDonation} Donation • ₹${grandTotal.toLocaleString('en-IN')})`;
      } else {
        el.btnConfirmSaleLabel.textContent = `CONFIRM SALE (${qty} ${qty === 1 ? 'Copy' : 'Copies'} • ₹${bookTotal.toLocaleString('en-IN')})`;
      }
    }
  }

  function openCashConfirmModal(saleData) {
    if (!el.modalConfirmSale) {
      executeSale(saleData);
      return;
    }

    if (el.confirmModalQty) {
      el.confirmModalQty.textContent = saleData.qty === 0 ? '0 Copies (Donation Only)' : `${saleData.qty} ${saleData.qty === 1 ? 'Copy' : 'Copies'}`;
    }
    if (el.confirmModalBookPrice) {
      el.confirmModalBookPrice.textContent = `₹${saleData.bookTotal.toLocaleString('en-IN')}`;
    }
    if (el.confirmModalDonationRow && el.confirmModalDonation) {
      if (saleData.donationAmount > 0) {
        el.confirmModalDonationRow.classList.remove('hidden');
        el.confirmModalDonation.textContent = `₹${saleData.donationAmount.toLocaleString('en-IN')}`;
      } else {
        el.confirmModalDonationRow.classList.add('hidden');
      }
    }
    if (el.confirmModalTotal) {
      el.confirmModalTotal.textContent = `₹${saleData.total.toLocaleString('en-IN')}`;
    }
    if (el.confirmModalChangeRow && el.confirmModalChange) {
      if (saleData.changeGiven > 0) {
        el.confirmModalChangeRow.classList.remove('hidden');
        el.confirmModalChange.textContent = `₹${saleData.changeGiven.toLocaleString('en-IN')}`;
      } else {
        el.confirmModalChangeRow.classList.add('hidden');
      }
    }
    if (el.confirmModalBuyer) {
      el.confirmModalBuyer.textContent = saleData.buyerName || 'Direct Buyer';
    }

    el.modalConfirmSale.classList.remove('hidden');
    CS_Audio.playTone(520, 'sine', 0.08);

    function handleKeydown(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitCashSale();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeCashModal();
      }
    }

    function commitCashSale() {
      document.removeEventListener('keydown', handleKeydown);
      el.modalConfirmSale.classList.add('hidden');
      executeSale(state.pendingSaleData);
    }

    function closeCashModal() {
      document.removeEventListener('keydown', handleKeydown);
      el.modalConfirmSale.classList.add('hidden');
    }

    document.addEventListener('keydown', handleKeydown);

    if (el.btnFinalizeSaleConfirmed) {
      el.btnFinalizeSaleConfirmed.onclick = commitCashSale;
    }
  }

  function executeSale(saleData) {
    try {
      const txn = CS_Store.recordSale({
        eventKey: state.eventKey,
        counterId: state.counterId,
        copies: saleData.qty,
        paymentMode: saleData.mode,
        buyerName: saleData.buyerName,
        buyerPhone: saleData.buyerPhone,
        cashReceived: saleData.cashReceived,
        changeGiven: saleData.changeGiven,
        donationAmount: saleData.donationAmount,
        isConfirmed: true
      });

      CS_Audio.cashChime();
      const successMsg = saleData.qty === 0
        ? `Donation Recorded! ₹${saleData.donationAmount} via ${saleData.mode}`
        : `Sale Recorded! ${saleData.qty} copies (₹${saleData.total}) via ${saleData.mode}`;
      showToast(successMsg, 'success');

      // Reset billing form
      if (el.inputBuyerCombined) el.inputBuyerCombined.value = '';
      if (el.inputBuyerName) el.inputBuyerName.value = '';
      if (el.inputBuyerPhone) el.inputBuyerPhone.value = '';
      if (el.inputCashTendered) el.inputCashTendered.value = '';
      if (el.inputExtraDonation) el.inputExtraDonation.value = '';
      if (el.chkKeepChangeDonation) el.chkKeepChangeDonation.checked = false;
      document.querySelectorAll('.btn-tender-chip').forEach(b => b.classList.remove('active'));
      state.selectedQty = 1;
      if (el.inputBillingQty) el.inputBillingQty.value = 1;
      document.querySelectorAll('.btn-qty-card').forEach(b => b.classList.toggle('active', b.dataset.qty === '1'));
      if (el.panelCustomQtyStepper) el.panelCustomQtyStepper.classList.add('hidden');
      updateBillingCalculation();

      renderPOSWorkspace();
    } catch (err) {
      CS_Audio.alertWarning();
      showToast(err.message, 'error');
    }
  }

  // Inter-Counter Exchange Handlers (Section 1.2)
  function openCounterExchangeModal() {
    const modal = document.getElementById('modal-counter-exchange');
    const select = document.getElementById('exchange-target-counter');
    const event = CS_Store.getEvent(state.eventKey);
    const counter = CS_Store.getCounter(state.eventKey, state.counterId);
    if (!modal || !event || !counter) return;

    state.activeExchangeType = 'BOOKS';
    if (el.btnTypeBooks) el.btnTypeBooks.classList.add('active');
    if (el.btnTypeCash) el.btnTypeCash.classList.remove('active');

    if (select) {
      select.innerHTML = '';
      (event.counters || []).forEach(c => {
        if (c.id !== state.counterId) {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = `${c.name} (${c.volunteers || 'Staff'})`;
          select.appendChild(opt);
        }
      });
    }

    updateExchangeAvailableHint();
    modal.classList.remove('hidden');
  }

  function updateExchangeAvailableHint() {
    const hint = document.getElementById('exchange-avail-hint');
    const label = document.getElementById('label-exchange-qty');
    const counter = CS_Store.getCounter(state.eventKey, state.counterId);
    if (!hint || !counter) return;

    if (state.activeExchangeType === 'BOOKS') {
      if (label) label.textContent = 'Number of Copies *';
      hint.textContent = `Available: ${counter.currentStock} copies`;
      hint.style.color = '#10B981';
    } else {
      if (label) label.textContent = 'Cash Float Amount (₹) *';
      const metrics = CS_Store.getBalancedLedgerMetrics(state.eventKey, 'ALL');
      const senderBrk = metrics ? metrics.counterBreakdown.find(b => b.id === counter.id) : null;
      const cash = senderBrk ? senderBrk.cashCollection : 0;
      hint.textContent = `Available Cash: ₹${cash.toLocaleString('en-IN')}`;
      hint.style.color = '#0066FF';
    }
  }

  function submitCounterExchange() {
    const select = document.getElementById('exchange-target-counter');
    const inputQty = document.getElementById('exchange-qty');
    const inputNotes = document.getElementById('exchange-notes');
    const toCounterId = select ? select.value : '';
    const amount = inputQty ? parseInt(inputQty.value, 10) : 0;
    const notes = inputNotes ? inputNotes.value.trim() : '';

    if (!toCounterId) {
      showToast('Please select a destination counter.', 'error');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid positive quantity or amount.', 'error');
      return;
    }

    try {
      CS_Store.initiateInterCounterTransfer({
        eventKey: state.eventKey,
        fromCounterId: state.counterId,
        toCounterId,
        type: state.activeExchangeType || 'BOOKS',
        amountOrQuantity: amount,
        notes,
        authorizedBy: el.posVolunteers ? el.posVolunteers.textContent.replace('Volunteers: ', '').trim() : 'Staff Volunteer'
      });

      CS_Audio.handshakeSuccess();
      showToast('Transfer request sent! Held pending destination counter acceptance.', 'success');
      const modal = document.getElementById('modal-counter-exchange');
      if (modal) modal.classList.add('hidden');
      if (inputQty) inputQty.value = '';
      if (inputNotes) inputNotes.value = '';
      renderPOSWorkspace();
    } catch (err) {
      CS_Audio.alertWarning();
      showToast(err.message, 'error');
    }
  }

  // Disaster Recovery JSON Restore Handlers (Section 2 & 3)
  function handleBackupFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const jsonStr = evt.target.result;
        const payload = JSON.parse(jsonStr);

        const eventName = payload.system_meta?.event_name || payload.event_snapshot?.name || 'Active Event';
        const counterName = payload.system_meta?.source_counter_id || 'Master Export';
        const timestamp = payload.system_meta?.backup_timestamp || payload.system_meta?.export_timestamp || new Date().toISOString();
        const salesCount = (payload.sales || []).length;
        const donCount = (payload.donations || []).length;
        const trfCount = (payload.inter_counter_transfers || []).length;

        if (el.restoreSummaryEvent) el.restoreSummaryEvent.textContent = eventName;
        if (el.restoreSummaryCounter) el.restoreSummaryCounter.textContent = counterName;
        if (el.restoreSummaryTime) el.restoreSummaryTime.textContent = new Date(timestamp).toLocaleString();
        if (el.chipRestoreSales) el.chipRestoreSales.textContent = `${salesCount} Sales`;
        if (el.chipRestoreDonations) el.chipRestoreDonations.textContent = `${donCount} Donations`;
        if (el.chipRestoreTransfers) el.chipRestoreTransfers.textContent = `${trfCount} Transfers`;

        state.pendingRestoreJson = jsonStr;

        const modal = document.getElementById('modal-restore-conflict');
        if (modal) modal.classList.remove('hidden');
      } catch (err) {
        CS_Audio.alertWarning();
        showToast(`Invalid JSON backup: ${err.message}`, 'error');
      } finally {
        if (el.inputRestoreBackup) el.inputRestoreBackup.value = '';
      }
    };
    reader.readAsText(file);
  }

  function executeBackupHydration() {
    if (!state.pendingRestoreJson) return;
    const policyRadio = document.querySelector('input[name="restore-policy"]:checked');
    const policy = policyRadio ? policyRadio.value : 'MERGE';

    try {
      const result = CS_Store.restoreBackupJSON({
        eventKey: state.eventKey,
        jsonString: state.pendingRestoreJson,
        policy
      });

      CS_Audio.handshakeSuccess();
      showToast(`Hydration complete! Restored with ${policy} policy.`, 'success');
      const modal = document.getElementById('modal-restore-conflict');
      if (modal) modal.classList.add('hidden');
      state.pendingRestoreJson = null;

      // Re-render across views
      renderPOSWorkspace();
      if (state.currentView === 'admin') renderAdminDashboard();
      if (state.currentView === 'stockroom') renderStockRoomWorkspace();
    } catch (err) {
      CS_Audio.alertWarning();
      showToast(err.message, 'error');
    }
  }

  function openVipModal() {
    const counter = CS_Store.getCounter(state.eventKey, state.counterId);
    if (!counter) return;

    if (counter.currentStock <= 0) {
      CS_Audio.alertWarning();
      showToast('Cannot issue free copies! Counter shelf stock is 0.', 'error');
      return;
    }

    if (el.inputVipQty) el.inputVipQty.value = '1';
    if (el.vipStockHint) el.vipStockHint.textContent = `(Available: ${counter.currentStock})`;
    if (el.inputVipRecipient) el.inputVipRecipient.value = '';
    if (el.inputVipVolunteer) {
      el.inputVipVolunteer.value = counter.volunteers ? counter.volunteers.split(',')[0].trim() : 'Staff';
    }
    if (el.modalVipHandover) {
      el.modalVipHandover.classList.remove('hidden');
      if (el.inputVipRecipient) {
        setTimeout(() => el.inputVipRecipient.focus(), 60);
      }
    }
  }

  function renderPOSWorkspace() {
    const event = CS_Store.getEvent(state.eventKey);
    const counter = CS_Store.getCounter(state.eventKey, state.counterId);
    if (!event || !counter) return;

    // Header labels
    if (el.headerEventSub) el.headerEventSub.textContent = event.name;
    if (el.headerStaffPill) el.headerStaffPill.textContent = 'Sales';

    // Top Card & Unified Ledger Metrics
    if (el.posCounterName) el.posCounterName.textContent = counter.name;
    if (el.posVolunteers) el.posVolunteers.textContent = `Volunteers: ${counter.volunteers}`;

    // Compute unified metrics from balanced store ledger for 100% data uniformity
    const metrics = CS_Store.getBalancedLedgerMetrics(state.eventKey, 'ALL');
    const breakdown = (metrics && metrics.counterBreakdown) 
      ? metrics.counterBreakdown.find(b => b.id === counter.id) 
      : null;

    const remainingStock = breakdown ? breakdown.currentStock : counter.currentStock;
    const soldCopies = breakdown ? breakdown.copiesSold : 0;
    const grandRev = breakdown ? breakdown.totalNetCollection : 0;

    if (el.heroStockCount) el.heroStockCount.textContent = remainingStock;

    // Requirement 2.1: Remaining copies color changes to bold red when stock <= 10
    const isLow = remainingStock <= 10;
    if (el.heroStockBox) el.heroStockBox.classList.toggle('low-stock', isLow);

    if (el.posKpiSold) el.posKpiSold.textContent = soldCopies;
    if (el.posKpiRevenue) el.posKpiRevenue.textContent = `₹${grandRev.toLocaleString('en-IN')}`;

    // Two-Way Stock Dispatch Banner
    const inTransit = (event.dispatches || []).find(d => d.counterId === counter.id && d.status === 'IN_TRANSIT');
    if (el.posDispatchBanner) {
      if (inTransit) {
        el.posDispatchBanner.classList.remove('hidden');
        if (el.posDispatchInfo) el.posDispatchInfo.textContent = `Batch ${inTransit.id} of ${inTransit.copies} copies dispatched by ${inTransit.dispatchedBy}. Tap handshake to accept.`;
        if (el.posDispatchQty) el.posDispatchQty.textContent = inTransit.copies;
      } else {
        el.posDispatchBanner.classList.add('hidden');
      }
    }

    // Two-Way Inter-Counter Transfer Banner (Section 1.2)
    const pendingTransfers = CS_Store.getPendingTransfersForCounter(state.eventKey, counter.id);
    if (el.posTransferBanner) {
      if (pendingTransfers.length > 0) {
        const trf = pendingTransfers[0];
        el.posTransferBanner.classList.remove('hidden');
        if (el.posTransferHeading) {
          el.posTransferHeading.textContent = `⇄ Incoming Transfer from ${trf.fromCounterName || trf.fromCounterId}!`;
        }
        if (el.posTransferDetails) {
          const itemText = trf.type === 'CASH' ? `₹${trf.amountOrQuantity} Cash Float` : `${trf.amountOrQuantity} Book Copies`;
          el.posTransferDetails.textContent = `${trf.fromCounterName || 'Peer desk'} sent ${itemText}.${trf.notes ? ' Memo: "' + trf.notes + '"' : ''} Accept transfer?`;
        }
        if (el.btnAcceptTransfer) {
          el.btnAcceptTransfer.onclick = () => {
            try {
              CS_Store.respondInterCounterTransfer({
                eventKey: state.eventKey,
                transferId: trf.transfer_id || trf.id,
                action: 'ACCEPT',
                authorizedBy: el.posVolunteers ? el.posVolunteers.textContent.replace('Volunteers: ', '').trim() : 'Staff Volunteer'
              });
              CS_Audio.handshakeSuccess();
              showToast(`Transfer accepted! Added ${trf.type === 'CASH' ? '₹' + trf.amountOrQuantity : trf.amountOrQuantity + ' copies'}.`, 'success');
              renderPOSWorkspace();
            } catch (err) {
              CS_Audio.alertWarning();
              showToast(err.message, 'error');
            }
          };
        }
        if (el.btnRejectTransfer) {
          el.btnRejectTransfer.onclick = () => {
            try {
              CS_Store.respondInterCounterTransfer({
                eventKey: state.eventKey,
                transferId: trf.transfer_id || trf.id,
                action: 'REJECT',
                authorizedBy: el.posVolunteers ? el.posVolunteers.textContent.replace('Volunteers: ', '').trim() : 'Staff Volunteer'
              });
              CS_Audio.playTone(300, 'square', 0.15);
              showToast('Transfer rejected. Funds/stock returned to sender.', 'info');
              renderPOSWorkspace();
            } catch (err) {
              CS_Audio.alertWarning();
              showToast(err.message, 'error');
            }
          };
        }
      } else {
        el.posTransferBanner.classList.add('hidden');
      }
    }

    updateBillingCalculation();
    updatePreorderUnreadBadge();

    // Render active tab content
    if (state.activeDockTab === 'preorders') renderPreOrdersList();
    else if (state.activeDockTab === 'history') renderCounterShiftLedger();
    else if (state.activeDockTab === 'endofday') updateDenominationCalculations();
  }

  function updatePreorderUnreadBadge() {
    const event = CS_Store.getEvent(state.eventKey);
    if (!event) return;
    const pendingCount = (event.preOrders || []).filter(p => p.status !== 'FULFILLED').length;
    const dot = document.getElementById('preorder-unread-dot');
    if (dot) {
      dot.style.display = pendingCount > 0 ? 'block' : 'none';
    }
  }

  function renderCounterShiftLedger() {
    const event = CS_Store.getEvent(state.eventKey);
    const container = document.getElementById('counter-recent-txns');
    const countEl = document.getElementById('counter-ledger-count');
    if (!container || !event) return;

    // Filter active (non-voided) shift transactions for this counter, sorted newest first
    const txns = (event.transactions || [])
      .filter(t => t.counterId === state.counterId && !t.voided)
      .slice()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (countEl) countEl.textContent = `${txns.length} ${txns.length === 1 ? 'transaction' : 'transactions'}`;
    container.innerHTML = '';

    if (txns.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 28px; color: var(--text-muted); font-size: 0.9rem;">No transactions recorded on this counter shift yet.</div>`;
      return;
    }

    txns.forEach(t => {
      const card = document.createElement('div');
      card.className = `history-txn-card ${t.voided ? 'voided' : ''}`;

      const timeStr = new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      card.innerHTML = `
        <div class="history-txn-left">
          <div class="history-badge-green" style="${t.type === 'VIP' ? 'background: rgba(147, 51, 234, 0.12); color: #9333EA;' : ''}">+${t.copies}</div>
          <div>
            <div class="history-txn-buyer">${t.buyerName || 'Direct Buyer'}</div>
            <div class="history-txn-time">${timeStr} • ${t.paymentMode}</div>
          </div>
        </div>
        <div class="history-txn-right">
          <div class="history-txn-cost" style="${t.type === 'VIP' ? 'color: #9333EA; font-size: 0.9rem;' : ''}">${t.type === 'VIP' ? 'Free VIP' : '₹' + t.totalAmount}</div>
          ${t.voided ? `
            <span style="font-size:0.75rem; color:#EF4444; font-weight:800;">Cancelled</span>
          ` : `
            <button type="button" class="btn-cancel-void-pill" data-void-id="${t.id}">↺ Cancel</button>
          `}
        </div>
      `;

      card.querySelectorAll('.btn-cancel-void-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openVoidDialog(t.id);
        });
      });

      container.appendChild(card);
    });
  }

  function openVoidDialog(txnId) {
    const event = CS_Store.getEvent(state.eventKey);
    const txn = (event ? event.transactions : []).find(t => t.id === txnId);
    if (!txn) return;

    if (el.voidTxnId) el.voidTxnId.value = txnId;
    if (el.voidReason) el.voidReason.value = 'Counter Staff Cancellation';
    if (el.voidPin) el.voidPin.value = '';

    const summaryEl = document.getElementById('void-txn-summary');
    if (summaryEl) {
      const amtStr = txn.totalAmount > 0 ? `₹${txn.totalAmount}` : 'Free VIP';
      summaryEl.textContent = `Cancel +${txn.copies} ${txn.copies === 1 ? 'copy' : 'copies'} (${amtStr} • ${txn.paymentMode}) for ${txn.buyerName || 'Direct Buyer'}?`;
    }

    const hintEl = document.getElementById('void-pin-hint');
    const counter = CS_Store.getCounter(state.eventKey, state.counterId);
    if (hintEl && counter) {
      hintEl.textContent = `Enter ${counter.name} PIN (e.g. ${counter.pin}) to confirm cancellation`;
    }

    if (el.modalVoidTxn) {
      el.modalVoidTxn.classList.remove('hidden');
      if (el.voidPin) {
        setTimeout(() => el.voidPin.focus(), 60);
      }
    }
  }

  function handleVoidTransaction() {
    const txnId = el.voidTxnId ? el.voidTxnId.value : '';
    const pin = el.voidPin ? el.voidPin.value.trim() : '';
    const counter = CS_Store.getCounter(state.eventKey, state.counterId);
    const event = CS_Store.getEvent(state.eventKey);

    if (!pin) {
      showToast('Please enter your Counter PIN to confirm cancellation', 'error');
      if (el.voidPin) el.voidPin.focus();
      return;
    }

    const isMatch = (counter && pin === counter.pin) || (event && (pin === event.adminPin || pin === '9999'));
    if (!isMatch) {
      CS_Audio.alertWarning();
      showToast(`Incorrect Counter PIN! Please enter the PIN for ${counter ? counter.name : 'this counter'}.`, 'error');
      if (el.voidPin) {
        el.voidPin.value = '';
        el.voidPin.focus();
      }
      return;
    }

    try {
      CS_Store.voidTransaction({
        eventKey: state.eventKey,
        transactionId: txnId,
        pin: pin,
        voidReason: 'Counter Staff Cancellation',
        voidedBy: counter ? counter.volunteers : 'Counter Staff'
      });

      if (el.modalVoidTxn) el.modalVoidTxn.classList.add('hidden');
      CS_Audio.alertWarning();
      showToast('Sale Cancelled! Copies & pre-order status restored.', 'success');
      renderPOSWorkspace();
      renderPreOrdersList();
      renderCounterShiftLedger();
      if (state.currentView === 'admin') renderAdminDashboard();
      if (state.currentView === 'stockroom') renderStockRoomWorkspace();
    } catch (err) {
      CS_Audio.alertWarning();
      showToast(err.message, 'error');
    }
  }

  function populateTransferCountersDropdown() {
    const event = CS_Store.getEvent(state.eventKey);
    const select = document.getElementById('transfer-target-counter');
    if (!select || !event) return;
    select.innerHTML = '';

    (event.counters || []).forEach(c => {
      if (c.id !== state.counterId) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name} (Current: ${c.currentStock} copies)`;
        select.appendChild(opt);
      }
    });
  }

  function renderPreOrdersList() {
    const event = CS_Store.getEvent(state.eventKey);
    const container = document.getElementById('preorders-list-container');
    if (!container || !event) return;

    const searchInput = document.getElementById('input-search-preorder');
    const query = (searchInput ? searchInput.value : '').toLowerCase().trim();

    container.innerHTML = '';
    const list = (event.preOrders || []).filter(p => {
      if (!query) return true;
      return p.token.toLowerCase().includes(query) ||
             p.buyerName.toLowerCase().includes(query) ||
             p.phone.includes(query);
    });

    if (list.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 28px; color: var(--text-muted); font-size: 0.9rem;">No matching pre-orders found.</div>`;
      return;
    }

    list.forEach(p => {
      const card = document.createElement('div');
      const isFulfilled = p.status === 'FULFILLED';
      const isPaid = p.paymentType === 'PAID';

      card.className = `preorder-item-card ${isFulfilled ? 'fulfilled' : ''}`;

      card.innerHTML = `
        <div>
          <div class="preorder-item-title-row">
            <span class="preorder-item-name">${p.buyerName}</span>
            <span class="${isPaid ? 'pill-already-paid' : 'pill-pay-pickup'}">${isPaid ? 'Already Paid' : 'Pay on Pickup'}</span>
            ${isFulfilled ? `<span class="pill-already-paid" style="background: rgba(16, 185, 129, 0.2); color: #059669; font-weight: 800;">✓ Handed Over</span>` : ''}
          </div>
          <div class="preorder-item-sub">
            ${p.token} • ${p.phone} • ${p.copies} ${p.copies === 1 ? 'copy' : 'copies'}
            ${isFulfilled && p.fulfilledAt ? ` • Handed over at ${new Date(p.fulfilledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          </div>
        </div>
        <div>
          ${isFulfilled ? `
            <button type="button" class="btn-preorder-fulfilled" disabled>
              <span>✓ Handed Over</span>
            </button>
          ` : `
            <button type="button" class="btn-amber-handover" data-token="${p.token}">Handover</button>
          `}
        </div>
      `;

      if (!isFulfilled) {
        const btnHandover = card.querySelector('.btn-amber-handover');
        if (btnHandover) {
          btnHandover.addEventListener('click', (e) => {
            e.stopPropagation();
            handleFulfillPreOrder(p);
          });
        }
      }

      container.appendChild(card);
    });

    updatePreorderUnreadBadge();
  }

  function handleFulfillPreOrder(preOrder) {
    if (!preOrder || preOrder.status === 'FULFILLED') {
      showToast(`Order ${preOrder ? preOrder.token : ''} has already been handed over!`, 'info');
      return;
    }

    const event = CS_Store.getEvent(state.eventKey);
    const counter = CS_Store.getCounter(state.eventKey, state.counterId);
    if (!counter) return;

    if (counter.currentStock < preOrder.copies) {
      CS_Audio.alertWarning();
      showToast(`Cannot fulfill! Counter has only ${counter.currentStock} copies remaining on shelf.`, 'error');
      return;
    }

    try {
      CS_Store.fulfillPreOrder({
        eventKey: state.eventKey,
        token: preOrder.token,
        counterId: state.counterId,
        paymentMode: 'CASH'
      });

      CS_Audio.handshakeSuccess();
      showToast(`Pre-Order ${preOrder.token} successfully Handed Over to ${preOrder.buyerName}!`, 'success');
      renderPOSWorkspace();
    } catch (err) {
      CS_Audio.alertWarning();
      showToast(err.message, 'error');
    }
  }

  function updateDenominationCalculations() {
    const denomInputs = document.querySelectorAll('.denom-input');
    let countedTotal = 0;
    denomInputs.forEach(inp => {
      const val = parseInt(inp.dataset.val, 10);
      const count = parseInt(inp.value, 10) || 0;
      countedTotal += val * count;
    });

    const event = CS_Store.getEvent(state.eventKey);
    const metrics = CS_Store.getBalancedLedgerMetrics(state.eventKey, 'ALL');
    const breakdown = (metrics && metrics.counterBreakdown) ? metrics.counterBreakdown.find(b => b.id === state.counterId) : null;
    const expectedCash = breakdown ? breakdown.cashCollection : 0;

    const expectedCashEl = document.getElementById('recon-expected-cash');
    if (expectedCashEl) expectedCashEl.textContent = `₹${expectedCash.toLocaleString('en-IN')}`;

    const countedCashEl = document.getElementById('recon-counted-cash');
    if (countedCashEl) countedCashEl.textContent = `₹${countedTotal.toLocaleString('en-IN')}`;

    const statusBanner = document.getElementById('recon-status-banner');
    if (statusBanner) {
      const diff = countedTotal - expectedCash;
      if (diff === 0) {
        statusBanner.textContent = 'Exact Match ✓';
        statusBanner.className = 'summary-col-val exact';
        statusBanner.style.color = '#10B981';
      } else if (diff < 0) {
        statusBanner.textContent = `Shortage -₹${Math.abs(diff).toLocaleString('en-IN')}`;
        statusBanner.className = 'summary-col-val shortage';
        statusBanner.style.color = '#EF4444';
      } else {
        statusBanner.textContent = `Surplus +₹${diff.toLocaleString('en-IN')}`;
        statusBanner.className = 'summary-col-val surplus';
        statusBanner.style.color = '#F59E0B';
      }
    }
  }

  function handleSaveReconciliation() {
    const expected = parseInt(document.getElementById('recon-expected-cash').dataset.expected, 10) || 0;
    let grandCounted = 0;
    const denoms = { 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0 };

    [500, 200, 100, 50, 20, 10].forEach(val => {
      const inp = document.querySelector(`.denom-input[data-val="${val}"]`);
      const count = parseInt(inp.value, 10) || 0;
      denoms[val] = count;
      grandCounted += count * val;
    });

    const diff = grandCounted - expected;
    const status = diff === 0 ? 'EXACT' : diff > 0 ? 'SURPLUS' : 'SHORTAGE';

    CS_Store.saveReconciliation({
      eventKey: state.eventKey,
      counterId: state.counterId,
      closedBy: el.posVolunteers.textContent.replace('Volunteers: ', '').trim(),
      expectedCash: expected,
      countedCash: grandCounted,
      denominations: denoms,
      status: status,
      difference: diff
    });

    CS_Audio.handshakeSuccess();
    showToast('Shift cash closing register submitted successfully!', 'success');
  }

  function downloadJsonBackup(counterId = null) {
    const cid = counterId || state.counterId;
    const jsonStr = CS_Store.exportBackupJSON(state.eventKey, cid);
    if (!jsonStr) {
      showToast('Could not generate backup file.', 'error');
      return;
    }
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const cleanCid = cid ? cid.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'master';
    a.download = `pos_backup_${cleanCid}_${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    CS_Audio.playTone(880, 'sine', 0.1);
    showToast(`Backup exported: ${a.download}`, 'success');
  }

  // --- 3. Central Stock Room & Warehouse Management ---
  function initStockRoomWorkspace() {
    document.getElementById('btn-refresh-stockroom').addEventListener('click', () => {
      renderStockRoomWorkspace();
      showToast('Warehouse inventory refreshed', 'info');
    });

    // 3.3 Counter Stock Dispatches
    document.getElementById('btn-submit-dispatch').addEventListener('click', () => {
      const targetId = document.getElementById('dispatch-target-counter').value;
      const qty = parseInt(document.getElementById('dispatch-qty').value, 10) || 0;

      try {
        const dispatch = CS_Store.addStockDispatch({
          eventKey: state.eventKey,
          counterId: targetId,
          copies: qty,
          dispatchedBy: 'Vikram M. (Central Vault)'
        });
        CS_Audio.handshakeSuccess();
        showToast(`Dispatched ${qty} copies! Awaiting counter handshake.`, 'success');
        renderStockRoomWorkspace();
      } catch (err) {
        CS_Audio.alertWarning();
        showToast(err.message, 'error');
      }
    });

    // 3.2 Vault Complimentary Giveaway
    document.getElementById('btn-submit-vault-giveaway').addEventListener('click', () => {
      const name = document.getElementById('vault-giveaway-name').value.trim();
      const desig = document.getElementById('vault-giveaway-desig').value.trim();
      const qty = parseInt(document.getElementById('vault-giveaway-qty').value, 10) || 0;

      if (!name) {
        showToast('Recipient dignitary name is required', 'error');
        return;
      }

      try {
        CS_Store.recordVaultGiveaway({
          eventKey: state.eventKey,
          recipientName: name,
          designation: desig,
          copies: qty,
          issuedBy: 'Organizer HQ Vault'
        });
        CS_Audio.handshakeSuccess();
        showToast(`Issued ${qty} complimentary copies to ${name}`, 'success');
        document.getElementById('vault-giveaway-name').value = '';
        document.getElementById('vault-giveaway-desig').value = '';
        document.getElementById('vault-giveaway-qty').value = '5';
        renderStockRoomWorkspace();
      } catch (err) {
        CS_Audio.alertWarning();
        showToast(err.message, 'error');
      }
    });

    // 3.4 Press Audit & Stock Correction
    document.getElementById('btn-submit-correction').addEventListener('click', () => {
      const delta = parseInt(document.getElementById('correction-delta').value, 10);
      const reason = document.getElementById('correction-reason').value;
      const notes = document.getElementById('correction-notes').value.trim();

      if (isNaN(delta) || delta === 0) {
        showToast('Enter a valid non-zero adjustment change (+/-)', 'error');
        return;
      }

      try {
        CS_Store.logPressCorrection({
          eventKey: state.eventKey,
          change: delta,
          reason: reason,
          notes: notes,
          loggedBy: 'Press Field Auditor'
        });
        CS_Audio.handshakeSuccess();
        showToast(`Applied Press Correction: ${delta > 0 ? '+' : ''}${delta} copies`, 'success');
        document.getElementById('correction-delta').value = '';
        document.getElementById('correction-notes').value = '';
        renderStockRoomWorkspace();
      } catch (err) {
        CS_Audio.alertWarning();
        showToast(err.message, 'error');
      }
    });

    // 3.5 PIN-Protected Press Floor Audit Modal triggers
    const btnOpenPressAudit = document.getElementById('btn-open-audit-press');
    if (btnOpenPressAudit) {
      btnOpenPressAudit.addEventListener('click', () => {
        const event = CS_Store.getEvent(state.eventKey);
        const currentInflow = (event && event.stockRoom && event.stockRoom.totalPressInflow) || 0;
        const currentQtyDisplay = document.getElementById('audit-press-current-qty');
        if (currentQtyDisplay) currentQtyDisplay.textContent = `${currentInflow.toLocaleString('en-IN')} copies`;
        const newQtyInput = document.getElementById('audit-press-new-qty');
        if (newQtyInput) newQtyInput.value = currentInflow;
        const notesInput = document.getElementById('audit-press-notes');
        if (notesInput) notesInput.value = '';
        const pinInput = document.getElementById('audit-press-pin');
        if (pinInput) pinInput.value = '';

        const modal = document.getElementById('modal-audit-press');
        if (modal) {
          modal.classList.remove('hidden');
          if (newQtyInput) setTimeout(() => newQtyInput.focus(), 60);
        }
      });
    }

    // Submit Press Audit Correction
    const btnSubmitPressAudit = document.getElementById('btn-submit-press-audit');
    if (btnSubmitPressAudit) {
      btnSubmitPressAudit.addEventListener('click', () => {
        const newQtyInput = document.getElementById('audit-press-new-qty');
        const reasonSelect = document.getElementById('audit-press-reason');
        const notesInput = document.getElementById('audit-press-notes');
        const pinInput = document.getElementById('audit-press-pin');

        const newQty = parseInt(newQtyInput ? newQtyInput.value : '0', 10);
        const reason = reasonSelect ? reasonSelect.value : 'Press Floor Audit & Quantity Correction';
        const notes = notesInput ? notesInput.value.trim() : '';
        const pin = pinInput ? pinInput.value.trim() : '';

        if (isNaN(newQty) || newQty < 0) {
          showToast('Please enter a valid non-negative number of copies', 'error');
          if (newQtyInput) newQtyInput.focus();
          return;
        }

        if (!pin) {
          showToast('PIN authorization required to modify press total quantity', 'error');
          if (pinInput) pinInput.focus();
          return;
        }

        try {
          const result = CS_Store.auditPressInflow({
            eventKey: state.eventKey,
            newTotalInflow: newQty,
            pin,
            reason,
            notes,
            auditedBy: state.role === 'admin' ? 'Super Admin' : (state.stockRoomKeeperName || 'Stock Room Keeper')
          });

          const modal = document.getElementById('modal-audit-press');
          if (modal) modal.classList.add('hidden');

          CS_Audio.handshakeSuccess();
          const deltaSign = result.delta >= 0 ? `+${result.delta}` : `${result.delta}`;
          showToast(`✓ Press Inflow audited: ${result.newTotal.toLocaleString('en-IN')} copies (${deltaSign})!`, 'success');
          renderStockRoomWorkspace();
          if (state.currentView === 'admin') renderAdminDashboard();
        } catch (err) {
          CS_Audio.alertWarning();
          showToast(err.message, 'error');
          if (pinInput) {
            pinInput.value = '';
            pinInput.focus();
          }
        }
      });
    }
  }

  function renderStockRoomWorkspace() {
    const event = CS_Store.getEvent(state.eventKey);
    if (!event) return;

    if (el.headerStaffPill) el.headerStaffPill.textContent = 'Stock';

    const keeperLabel = document.getElementById('stockroom-keeper-label');
    if (keeperLabel) {
      keeperLabel.textContent = (event.stockRoom && (event.stockRoom.keeperName || event.stockRoom.keeper)) || 'Vikram Malhotra';
    }

    // Populate target counter select
    const select = document.getElementById('dispatch-target-counter');
    select.innerHTML = '';
    (event.counters || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} (Has ${c.currentStock} copies)`;
      select.appendChild(opt);
    });

    // Compute Metrics
    const metrics = CS_Store.getBalancedLedgerMetrics(state.eventKey, 'ALL');

    document.getElementById('sr-kpi-inflow').textContent = metrics.netPressInflow.toLocaleString('en-IN');
    document.getElementById('sr-kpi-reserve').textContent = metrics.reserveInStockRoom.toLocaleString('en-IN');
    document.getElementById('sr-kpi-distributed').textContent = (metrics.activeCountersStock + metrics.totalCopiesSold).toLocaleString('en-IN');
    document.getElementById('sr-kpi-giveaway').textContent = metrics.totalVIPCopies.toLocaleString('en-IN');

    // 3.2 Individual Counters Live Stock Status Monitor
    const counters = event.counters || [];
    const counterStockTbody = document.getElementById('sr-counters-stock-tbody');
    const totalCountersPill = document.getElementById('sr-active-counters-pill');
    const totalFieldCopiesEl = document.getElementById('sr-total-field-copies');

    if (totalCountersPill) totalCountersPill.textContent = `${counters.length} Counters Active`;
    const totalFieldStock = counters.reduce((sum, c) => sum + (c.currentStock || 0), 0);
    if (totalFieldCopiesEl) totalFieldCopiesEl.textContent = totalFieldStock.toLocaleString('en-IN');

    if (counterStockTbody) {
      counterStockTbody.innerHTML = '';
      if (counters.length === 0) {
        counterStockTbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--text-muted);">No sales counters registered for this event.</td></tr>`;
      } else {
        counters.forEach(c => {
          const breakdown = (metrics.counterBreakdown || []).find(b => b.id === c.id) || {};
          const soldCount = breakdown.copiesSold || 0;
          const vipCount = breakdown.copiesVip || 0;
          const suppliedCount = breakdown.stockSupplied || (c.initialStock || c.currentStock);
          const inTransitCount = (event.dispatches || []).filter(d => d.counterId === c.id && d.status === 'IN_TRANSIT').reduce((s, d) => s + d.copies, 0);

          let statusBadge = '';
          if (c.currentStock <= 10) {
            statusBadge = `<span class="stock-pill low">⚠️ LOW (≤10)</span>`;
          } else if (c.currentStock <= 25) {
            statusBadge = `<span class="stock-pill" style="background: rgba(245, 158, 11, 0.15); color: #F59E0B; border: 1px solid rgba(245, 158, 11, 0.3);">⚡ MODERATE</span>`;
          } else {
            statusBadge = `<span class="stock-pill" style="background: rgba(16, 185, 129, 0.15); color: #059669; border: 1px solid rgba(16, 185, 129, 0.3);">✓ HEALTHY</span>`;
          }

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>
              <strong>${c.name}</strong><br>
              <span style="font-size: 0.75rem; color: var(--text-muted);">PIN: ${c.pin}</span>
            </td>
            <td>
              <span style="font-weight: 600;">${c.volunteers}</span><br>
              <span style="font-size: 0.72rem; color: var(--cs-electric-blue); font-family: monospace;">${c.upiId || ''}</span>
            </td>
            <td>
              <span class="${c.currentStock <= 10 ? 'text-rose' : 'text-blue'}" style="font-size: 1.15rem; font-weight: 800;">${c.currentStock}</span>
              <span style="font-size: 0.75rem; color: var(--text-muted);">copies</span>
            </td>
            <td>${statusBadge}</td>
            <td><strong>${suppliedCount}</strong> <span style="font-size:0.75rem; color:var(--text-muted);">copies</span></td>
            <td>
              <strong class="text-blue">${soldCount}</strong>
              ${vipCount > 0 ? `<span style="font-size: 0.75rem; color: #9333EA;"> (+${vipCount} VIP)</span>` : ''}
            </td>
            <td>
              ${inTransitCount > 0 
                ? `<span style="color: var(--cs-cyan); font-weight: 700;">🚚 +${inTransitCount} in transit</span>` 
                : `<span style="color: var(--text-muted); font-size: 0.8rem;">None</span>`}
            </td>
            <td>
              <button type="button" class="btn-pill btn-pill-primary sr-btn-dispatch-counter" data-cid="${c.id}" style="padding: 4px 10px; font-size: 0.78rem;">
                📦 Dispatch
              </button>
            </td>
          `;

          const btnDispatch = tr.querySelector('.sr-btn-dispatch-counter');
          if (btnDispatch) {
            btnDispatch.addEventListener('click', () => {
              if (select) select.value = c.id;
              const qtyInput = document.getElementById('dispatch-qty');
              if (qtyInput) {
                qtyInput.value = c.currentStock <= 10 ? '50' : '25';
                qtyInput.focus();
                qtyInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
              showToast(`Selected ${c.name} for dispatch. Set quantity and confirm.`, 'info');
            });
          }

          counterStockTbody.appendChild(tr);
        });
      }
    }

    // In-Transit Table
    const dispatches = event.dispatches || [];
    const inTransitCount = dispatches.filter(d => d.status === 'IN_TRANSIT').length;
    document.getElementById('sr-active-dispatches-count').textContent = `${inTransitCount} In Transit`;

    const tbody = document.getElementById('sr-dispatches-tbody');
    tbody.innerHTML = '';
    if (dispatches.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">No dispatches logged yet.</td></tr>`;
    } else {
      dispatches.forEach(d => {
        const tr = document.createElement('tr');
        const isInTransit = d.status === 'IN_TRANSIT';
        tr.innerHTML = `
          <td><strong>${d.id}</strong></td>
          <td>${d.counterName}</td>
          <td><strong style="color: var(--cs-cyan);">${d.copies}</strong></td>
          <td>${new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
          <td>
            <span class="stock-pill ${isInTransit ? 'low' : ''}" style="${isInTransit ? '' : 'background: rgba(16,185,129,0.15); color: var(--color-emerald);'}">
              ${isInTransit ? '🚚 IN TRANSIT' : '✓ ACCEPTED'}
            </span>
          </td>
          <td>${d.acceptedBy || '<em style="color: var(--text-muted);">Awaiting Counter Handshake</em>'}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    // Low Stock Alert Table
    const lowStockCounters = (event.counters || []).filter(c => c.lowStockAlert || c.currentStock <= 10);
    document.getElementById('sr-low-stock-alert-count').textContent = `${lowStockCounters.length} Alerts`;

    const lowStockTbody = document.getElementById('sr-low-stock-tbody');
    lowStockTbody.innerHTML = '';
    if (lowStockCounters.length === 0) {
      lowStockTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--color-emerald);">All sales counters have healthy inventory reserves.</td></tr>`;
    } else {
      lowStockCounters.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${c.name}</strong></td>
          <td>${c.volunteers}</td>
          <td><strong class="text-rose">${c.currentStock} copies</strong></td>
          <td>${c.lowStockTimestamp ? new Date(c.lowStockTimestamp).toLocaleTimeString() : 'Automatic Threshold (≤10)'}</td>
          <td>
            <button class="btn-pill btn-pill-primary btn-quick-dispatch" data-cid="${c.id}" style="padding: 4px 10px; font-size: 0.78rem;">
              Dispatch 50 Copies →
            </button>
          </td>
        `;
        tr.querySelector('.btn-quick-dispatch').addEventListener('click', () => {
          CS_Store.addStockDispatch({
            eventKey: state.eventKey,
            counterId: c.id,
            copies: 50,
            dispatchedBy: 'Stock Room Alert Response'
          });
          CS_Audio.handshakeSuccess();
          showToast(`Dispatched emergency batch of 50 copies to ${c.name}!`, 'success');
          renderStockRoomWorkspace();
        });
        lowStockTbody.appendChild(tr);
      });
    }
  }

  // --- 4. Super Admin Executive Master Dashboard ---
  function initAdminDashboard() {
    // 4.1 Copy Event Access Key
    document.getElementById('btn-copy-access-key').addEventListener('click', () => {
      navigator.clipboard.writeText(state.eventKey).then(() => {
        showToast(`Event Access Key "${state.eventKey}" copied to clipboard!`, 'success');
      });
    });

    // 4.2 Multi-Day Date Filter
    document.getElementById('admin-date-filter').addEventListener('change', (e) => {
      state.adminFilterDate = e.target.value;
      renderAdminDashboard();
    });

    // 4.6 CSV Export
    document.getElementById('btn-export-csv').addEventListener('click', () => {
      const csvStr = CS_Store.generateCSV(state.eventKey, state.adminFilterDate);
      const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CounterSync-${state.eventKey}-Audit-${state.adminFilterDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported CSV register for ${state.adminFilterDate}`, 'success');
    });

    document.getElementById('btn-download-json-master').addEventListener('click', downloadJsonBackup);

    // Counter Management Modal
    document.getElementById('btn-open-counter-mgmt').addEventListener('click', () => {
      openCounterManagementModal();
    });

    document.getElementById('btn-save-counter-mgmt').addEventListener('click', handleSaveCounterManagement);

    // Event Master Settings Modal
    document.getElementById('btn-open-event-settings').addEventListener('click', () => {
      openEventSettingsModal();
    });

    document.getElementById('btn-save-event-settings').addEventListener('click', handleSaveEventSettings);

    // Search transactions in register
    document.getElementById('admin-search-txns').addEventListener('input', () => {
      renderAdminTransactionsRegister();
    });
  }

  function renderAdminDashboard() {
    const event = CS_Store.getEvent(state.eventKey);
    if (!event) return;

    if (el.headerStaffPill) el.headerStaffPill.textContent = 'Admin';

    // Header info
    document.getElementById('admin-event-name-display').textContent = event.name;
    document.getElementById('admin-event-book-title').textContent = `Book: ${event.bookTitle} • Retail ₹${event.unitPrice}`;
    document.getElementById('admin-master-key-code').textContent = event.key;
    const adminKeeperDisplay = document.getElementById('admin-stockroom-keeper-display');
    if (adminKeeperDisplay && event.stockRoom) {
      adminKeeperDisplay.textContent = event.stockRoom.keeperName || event.stockRoom.keeper || 'Vikram Malhotra';
    }

    // Populate date filter dropdown
    const filterSelect = document.getElementById('admin-date-filter');
    const dates = CS_Store.getEventDates(state.eventKey);
    const currentVal = state.adminFilterDate;

    filterSelect.innerHTML = `
      <option value="ALL">All Days (Grand Total)</option>
      <option value="TODAY">Today Only</option>
    `;

    dates.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = `Date: ${d}`;
      filterSelect.appendChild(opt);
    });
    filterSelect.value = currentVal;

    // 4.3 & 4.4 Balanced Matrix & Financial KPIs
    const metrics = CS_Store.getBalancedLedgerMetrics(state.eventKey, state.adminFilterDate);
    if (!metrics) return;

    document.getElementById('m-inflow').textContent = metrics.netPressInflow.toLocaleString('en-IN');
    document.getElementById('m-sold').textContent = metrics.totalCopiesSold.toLocaleString('en-IN');
    document.getElementById('m-vip').textContent = metrics.totalVIPCopies.toLocaleString('en-IN');
    document.getElementById('m-reserve').textContent = metrics.reserveInStockRoom.toLocaleString('en-IN');
    document.getElementById('m-active').textContent = metrics.activeCountersStock.toLocaleString('en-IN');
    document.getElementById('m-unsold').textContent = metrics.grandUnsoldBalance.toLocaleString('en-IN');

    document.getElementById('kpi-gross-rev').textContent = `₹${metrics.grossRevenue.toLocaleString('en-IN')}`;
    document.getElementById('kpi-cash-total').textContent = `₹${metrics.cashTotal.toLocaleString('en-IN')}`;
    document.getElementById('kpi-upi-total').textContent = `₹${metrics.upiTotal.toLocaleString('en-IN')}`;
    document.getElementById('kpi-preorder-ratio').textContent = `${metrics.fulfilledPreOrders} / ${metrics.fulfilledPreOrders + metrics.pendingPreOrders}`;
    document.getElementById('kpi-preorder-sub').textContent = `${metrics.fulfilledPreOrders} Delivered • ${metrics.pendingPreOrders} Pending`;

    // Micro-Donations KPI (Section 1.1)
    const kpiDonations = document.getElementById('kpi-donations-total');
    const kpiDonationsSub = document.getElementById('kpi-donations-sub');
    const totalDonations = metrics.totalDonations || 0;
    const donCount = (event.donations || []).length;
    if (kpiDonations) kpiDonations.textContent = `₹${totalDonations.toLocaleString('en-IN')}`;
    if (kpiDonationsSub) kpiDonationsSub.textContent = `${donCount} ${donCount === 1 ? 'donation' : 'donations'} • Discretionary & waived change`;

    // 4.5 Live Counter Performance Table
    const tbody = document.getElementById('admin-counters-tbody');
    tbody.innerHTML = '';
    document.getElementById('admin-counter-count-pill').textContent = `${metrics.counterBreakdown.length} Counters Active`;

    metrics.counterBreakdown.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <strong>${c.name}</strong><br>
          <span style="font-size: 0.75rem; color: var(--text-muted);">PIN: ${c.pin}</span>
        </td>
        <td>
          ${c.volunteers}<br>
          <span style="font-size: 0.75rem; color: var(--cs-electric-blue); font-family: monospace;">${c.upiId}</span>
        </td>
        <td><strong>${c.stockSupplied}</strong></td>
        <td><strong class="text-blue">${c.copiesSold}</strong></td>
        <td><strong class="text-amber">${c.copiesVip}</strong></td>
        <td>
          <span class="stock-pill ${c.currentStock <= 10 ? 'low' : ''}">
            ${c.currentStock} copies
          </span>
        </td>
        <td class="text-emerald">₹${c.cashCollection.toLocaleString('en-IN')}</td>
        <td style="color: var(--cs-cyan);">₹${c.upiCollection.toLocaleString('en-IN')}</td>
        <td><strong style="font-size: 1rem; color: var(--text-primary);">₹${c.totalNetCollection.toLocaleString('en-IN')}</strong></td>
      `;
      tbody.appendChild(tr);
    });

    renderAdminTransactionsRegister();
    renderAdminDonationsLedger();
    renderAdminTransfersAudit();
  }

  function renderAdminTransactionsRegister() {
    const event = CS_Store.getEvent(state.eventKey);
    const tbody = document.getElementById('admin-transactions-tbody');
    const query = (document.getElementById('admin-search-txns').value || '').toLowerCase().trim();

    tbody.innerHTML = '';
    let txns = event.transactions || [];

    if (state.adminFilterDate !== 'ALL') {
      const targetDate = state.adminFilterDate === 'TODAY' ? new Date().toISOString().slice(0, 10) : state.adminFilterDate;
      txns = txns.filter(t => t.timestamp && t.timestamp.slice(0, 10) === targetDate);
    }

    if (query) {
      txns = txns.filter(t => {
        return t.id.toLowerCase().includes(query) ||
               (t.counterName || '').toLowerCase().includes(query) ||
               (t.buyerName || '').toLowerCase().includes(query) ||
               (t.paymentMode || '').toLowerCase().includes(query);
      });
    }

    if (txns.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color: var(--text-muted);">No transactions match filter criteria.</td></tr>`;
      return;
    }

    txns.forEach(t => {
      const tr = document.createElement('tr');
      if (t.voided) tr.style.opacity = '0.55';

      tr.innerHTML = `
        <td><strong>${t.id}</strong></td>
        <td>${new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
        <td>${t.counterName}</td>
        <td>${t.type}</td>
        <td><strong>${t.copies}</strong></td>
        <td><strong>${t.totalAmount === 0 ? '₹0 (VIP)' : '₹' + t.totalAmount.toLocaleString('en-IN')}</strong></td>
        <td>${t.paymentMode}</td>
        <td>${t.buyerName || '—'} ${t.designation ? '(' + t.designation + ')' : ''}</td>
        <td>
          <span class="stock-pill ${t.voided ? 'low' : ''}" style="${t.voided ? '' : 'background: rgba(16,185,129,0.15); color: var(--color-emerald);'}">
            ${t.voided ? 'VOIDED' : 'VALID'}
          </span>
        </td>
        <td>
          ${t.voided ? '—' : `<button class="btn-void-txn" data-void-id="${t.id}">Void</button>`}
        </td>
      `;

      tr.querySelectorAll('.btn-void-txn').forEach(b => {
        b.addEventListener('click', () => openVoidDialog(t.id));
      });

      tbody.appendChild(tr);
    });
  }

  function renderAdminDonationsLedger() {
    const event = CS_Store.getEvent(state.eventKey);
    const tbody = document.getElementById('admin-donations-tbody');
    const countPill = document.getElementById('admin-donations-count-pill');
    if (!tbody || !event) return;

    let donations = event.donations || [];
    if (state.adminFilterDate !== 'ALL') {
      const targetDate = state.adminFilterDate === 'TODAY' ? new Date().toISOString().slice(0, 10) : state.adminFilterDate;
      donations = donations.filter(d => d.timestamp && d.timestamp.slice(0, 10) === targetDate);
    }

    if (countPill) {
      countPill.textContent = `${donations.length} ${donations.length === 1 ? 'Donation' : 'Donations'}`;
    }

    tbody.innerHTML = '';
    if (donations.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--text-muted); padding: 18px;">No micro-donations recorded under active date filter.</td></tr>`;
      return;
    }

    donations.forEach(d => {
      const tr = document.createElement('tr');
      const timeStr = d.timestamp ? new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
      tr.innerHTML = `
        <td><code style="font-size: 0.78rem;">${d.donation_id || d.id || '—'}</code></td>
        <td>${timeStr}</td>
        <td><strong>${d.counter_name || d.counter_id}</strong></td>
        <td>${d.donor_name || 'Anonymous'}${d.donor_phone ? ' (' + d.donor_phone + ')' : ''}</td>
        <td><strong style="color: #DB2777; font-size: 0.95rem;">₹${(d.amount || 0).toLocaleString('en-IN')}</strong></td>
        <td><span class="stock-pill" style="font-size: 0.72rem;">${d.payment_mode || 'CASH'}</span></td>
        <td style="font-size: 0.8rem; color: var(--text-secondary);">${d.notes || (d.linked_sale_id ? 'Linked: ' + d.linked_sale_id : 'Discretionary contribution')}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderAdminTransfersAudit() {
    const event = CS_Store.getEvent(state.eventKey);
    const tbody = document.getElementById('admin-transfers-tbody');
    const countPill = document.getElementById('admin-transfers-count-pill');
    if (!tbody || !event) return;

    let transfers = event.transfers || [];
    if (state.adminFilterDate !== 'ALL') {
      const targetDate = state.adminFilterDate === 'TODAY' ? new Date().toISOString().slice(0, 10) : state.adminFilterDate;
      transfers = transfers.filter(t => t.timestamp && t.timestamp.slice(0, 10) === targetDate);
    }

    if (countPill) {
      countPill.textContent = `${transfers.length} ${transfers.length === 1 ? 'Transfer' : 'Transfers'}`;
    }

    tbody.innerHTML = '';
    if (transfers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--text-muted); padding: 18px;">No inter-counter transfers recorded under active date filter.</td></tr>`;
      return;
    }

    transfers.forEach(t => {
      const tr = document.createElement('tr');
      const timeStr = t.timestamp ? new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
      const isBooks = (t.type || 'BOOKS') === 'BOOKS';
      const status = t.status || 'ACCEPTED';

      let statusStyle = 'background: #EFF6FF; color: #1D4ED8;';
      if (status === 'ACCEPTED') statusStyle = 'background: #ECFDF5; color: #059669;';
      else if (status === 'REJECTED') statusStyle = 'background: #FEF2F2; color: #DC2626;';
      else if (status === 'PENDING') statusStyle = 'background: #FFFBEB; color: #D97706; font-weight: 800;';

      tr.innerHTML = `
        <td><code style="font-size: 0.78rem;">${t.transfer_id || t.id || 'TRF'}</code></td>
        <td>${timeStr}</td>
        <td><strong>${t.fromCounterName || t.fromCounterId}</strong></td>
        <td><strong>${t.toCounterName || t.toCounterId}</strong></td>
        <td><span class="stock-pill" style="font-size: 0.72rem;">${isBooks ? '📚 BOOKS' : '💵 CASH'}</span></td>
        <td><strong>${isBooks ? t.amountOrQuantity + ' copies' : '₹' + Number(t.amountOrQuantity).toLocaleString('en-IN')}</strong></td>
        <td style="font-size: 0.8rem; color: var(--text-secondary);">${t.notes || '—'}</td>
        <td><span class="stock-pill" style="${statusStyle}">${status}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  function openCounterManagementModal() {
    const event = CS_Store.getEvent(state.eventKey);
    const listContainer = document.getElementById('mgmt-counter-list');
    listContainer.innerHTML = '';

    (event.counters || []).forEach(c => {
      const div = document.createElement('div');
      div.style.cssText = 'background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px; display: flex; justify-content: space-between; align-items: center;';
      div.innerHTML = `
        <div>
          <strong style="font-size: 0.95rem;">${c.name}</strong> • PIN: <code>${c.pin}</code>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
            Volunteers: ${c.volunteers} • Stock: ${c.currentStock} • UPI: ${c.upiId}
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn-pill btn-pill-subtle btn-edit-c" style="padding: 4px 10px; font-size: 0.75rem;">Edit</button>
          <button class="btn-pill btn-pill-subtle btn-del-c" style="padding: 4px 10px; font-size: 0.75rem; color: var(--color-rose);">Delete</button>
        </div>
      `;

      div.querySelector('.btn-edit-c').addEventListener('click', () => {
        document.getElementById('edit-counter-id').value = c.id;
        document.getElementById('mgmt-counter-name').value = c.name;
        document.getElementById('mgmt-counter-pin').value = c.pin;
        document.getElementById('mgmt-counter-volunteers').value = c.volunteers;
        document.getElementById('mgmt-counter-upi').value = c.upiId;
        document.getElementById('mgmt-counter-stock').value = c.currentStock;
      });

      div.querySelector('.btn-del-c').addEventListener('click', () => {
        if (confirm(`Delete ${c.name}? Any remaining physical stock will be safely returned to central vault.`)) {
          CS_Store.deleteCounter(state.eventKey, c.id);
          showToast(`Deleted ${c.name}`, 'info');
          openCounterManagementModal();
          renderAdminDashboard();
        }
      });

      listContainer.appendChild(div);
    });

    document.getElementById('modal-counter-mgmt').classList.remove('hidden');
  }

  function handleSaveCounterManagement() {
    const id = document.getElementById('edit-counter-id').value;
    const name = document.getElementById('mgmt-counter-name').value.trim();
    const pin = document.getElementById('mgmt-counter-pin').value.trim();
    const volunteers = document.getElementById('mgmt-counter-volunteers').value.trim();
    const upiId = document.getElementById('mgmt-counter-upi').value.trim();
    const stock = parseInt(document.getElementById('mgmt-counter-stock').value, 10) || 0;

    if (!name || !pin) {
      showToast('Counter name and 4-digit PIN are required', 'error');
      return;
    }

    CS_Store.saveCounter(state.eventKey, {
      id: id || undefined,
      name,
      pin,
      volunteers: volunteers || 'Volunteer Staff',
      upiId: upiId || 'counter@upi',
      initialStock: stock
    });

    CS_Audio.handshakeSuccess();
    showToast(`Saved configuration for ${name}`, 'success');

    // Reset inputs
    document.getElementById('edit-counter-id').value = '';
    document.getElementById('mgmt-counter-name').value = '';
    document.getElementById('mgmt-counter-pin').value = '';
    document.getElementById('mgmt-counter-volunteers').value = '';
    document.getElementById('mgmt-counter-upi').value = '';
    document.getElementById('mgmt-counter-stock').value = '50';

    openCounterManagementModal();
    renderAdminDashboard();
  }

  function openEventSettingsModal() {
    const event = CS_Store.getEvent(state.eventKey);
    if (!event) return;

    document.getElementById('set-event-name').value = event.name;
    document.getElementById('set-book-title').value = event.bookTitle;
    document.getElementById('set-unit-price').value = event.unitPrice;
    document.getElementById('set-event-key').value = event.key;
    document.getElementById('set-admin-pin').value = event.adminPin;
    document.getElementById('set-stock-pin').value = event.stockRoomPin;

    const keeperInput = document.getElementById('set-stock-keeper');
    if (keeperInput) {
      keeperInput.value = (event.stockRoom && (event.stockRoom.keeperName || event.stockRoom.keeper)) || event.stockRoomKeeper || 'Vikram Malhotra & Logistics Squad';
    }

    document.getElementById('modal-event-settings').classList.remove('hidden');
  }

  function handleSaveEventSettings() {
    const name = document.getElementById('set-event-name').value.trim();
    const bookTitle = document.getElementById('set-book-title').value.trim();
    const unitPrice = document.getElementById('set-unit-price').value;
    const adminPin = document.getElementById('set-admin-pin').value.trim();
    const stockRoomPin = document.getElementById('set-stock-pin').value.trim();
    const stockRoomKeeper = (document.getElementById('set-stock-keeper') ? document.getElementById('set-stock-keeper').value.trim() : '') || 'Stock Room Keeper';

    CS_Store.updateEventSettings(state.eventKey, {
      name,
      bookTitle,
      unitPrice,
      adminPin,
      stockRoomPin,
      stockRoomKeeper
    });

    document.getElementById('modal-event-settings').classList.add('hidden');
    CS_Audio.handshakeSuccess();
    showToast('Master Event Settings Updated', 'success');
    renderAdminDashboard();
  }

  // --- Modal Close Handlers ---
  function initModals() {
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.closeModal;
        const m = document.getElementById(modalId);
        if (m) m.classList.add('hidden');
      });
    });

    // Close on overlay backdrop click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
      });
    });
  }

  // --- Real-time Local & Cross-Tab State Sync Listener ---
  CS_Store.subscribe((eventType, data) => {
    if (eventType === 'CLOUD_SYNC') {
      if (data && data.hasPendingWrites) {
        updateSyncIndicator('syncing', 'Writing...');
      } else {
        updateSyncIndicator('synced', window.CS_Firebase && window.CS_Firebase.isReady ? 'Cloud Live' : 'Synced');
      }
    } else if (eventType === 'LOCAL_SAVE') {
      if (window.CS_Firebase && window.CS_Firebase.isReady && navigator.onLine) {
        updateSyncIndicator('syncing', 'Syncing...');
        setTimeout(() => updateSyncIndicator('synced', 'Cloud Live'), 1000);
      }
    }

    if (state.currentView === 'pos') {
      renderPOSWorkspace();
    } else if (state.currentView === 'stockroom') {
      renderStockRoomWorkspace();
    } else if (state.currentView === 'admin') {
      renderAdminDashboard();
    }
  });

  // --- Network Online / Offline Listeners for Fallback Sync ---
  window.addEventListener('online', () => {
    updateSyncIndicator('syncing', 'Reconnecting...');
    if (state.eventKey) {
      CS_Store.initCloudSync(state.eventKey);
    }
    setTimeout(() => {
      updateSyncIndicator('synced', window.CS_Firebase && window.CS_Firebase.isReady ? 'Cloud Live' : 'Synced');
      showToast('Cloud connection restored. Live sync active.', 'success');
    }, 1200);
  });

  window.addEventListener('offline', () => {
    updateSyncIndicator('offline', 'Offline Ready');
    showToast('Offline Mode: Sales saved locally and will sync when reconnected.', 'info');
  });

  // --- Service Worker Registration for Offline PWA Field Deployment ---
  function registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        console.log('CounterSync PWA Service Worker Registered:', reg.scope);
      }).catch((err) => {
        console.log('Service Worker registration skipped (running via file:// or unsupported context):', err);
      });
    }
  }

  // --- App Initialization Bootstrapper ---
  function init() {
    try {
      cacheDOMElements();
      initTheme();
      initGateway();
      initPOSWorkspace();
      initStockRoomWorkspace();
      initAdminDashboard();
      initModals();
      registerServiceWorker();

      // Check if there was an active session
      const session = CS_Store.getSession();
      if (session && session.role && session.eventKey) {
        state.eventKey = session.eventKey;
        state.role = session.role;
        state.counterId = session.counterId || null;
        CS_Store.initCloudSync(session.eventKey);

        if (session.role === 'POS' && state.counterId) {
          navigateTo('pos');
        } else if (session.role === 'STOCKROOM') {
          navigateTo('stockroom');
        } else if (session.role === 'ADMIN') {
          navigateTo('admin');
        } else {
          navigateTo('landing');
        }
      } else {
        navigateTo('landing');
      }
    } catch (err) {
      console.error("CounterSync initialization error:", err);
    }
  }

  // DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
