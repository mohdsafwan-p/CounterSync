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
    el.viewOwnerPortal = document.getElementById('view-owner-portal');
    el.viewHostRequest = document.getElementById('view-host-request');
    el.viewRentalStatus = document.getElementById('view-rental-status');
    el.modalRentalApproval = document.getElementById('modal-rental-approval');

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

  // Helper: check if active workspace is an approved live/hosted workspace
  function isLiveHostedWorkspace() {
    if (state.currentView === 'landing' || state.currentView === 'host-request' || state.currentView === 'rental-status') {
      return false;
    }
    if (state.currentView === 'pos' || state.currentView === 'stockroom' || state.currentView === 'owner-portal') {
      return true;
    }
    if (state.currentView === 'admin') {
      if (state.eventKey) {
        const license = CS_Store.isEventLicenseValid(state.eventKey);
        if (license && (license.status === 'PENDING' || license.status === 'UNDER_REVIEW')) {
          return false;
        }
      }
      return true;
    }
    return false;
  }

  // --- View Switcher ---
  function navigateTo(viewName) {
    // Strict Platform Owner Portal Security Guard
    if (viewName === 'owner-portal') {
      const session = CS_Store.getSession();
      const user = state.currentUser || (session ? session.user : null);
      const email = user ? (user.email || '') : '';
      if (!CS_Store.isPlatformOwner(email)) {
        if (typeof showToast === 'function') {
          showToast('Access Denied: Only platform owner (safwanvgd313@gmail.com) can access this console.', 'error');
        }
        if (typeof CS_Audio !== 'undefined' && CS_Audio.alertWarning) {
          CS_Audio.alertWarning();
        }
        viewName = 'landing';
      }
    }

    state.currentView = viewName;

    // Requirement 1: Remove screen lock timer when in 'Under Review' or 'Pending Request' status;
    // activate timer logic ONLY after event has been approved and is live/hosted.
    const isLiveHosted = isLiveHostedWorkspace();

    // Header auto-hiding behavior: Hidden on gateway landing screen
    if (viewName === 'landing') {
      el.appHeader.classList.add('hidden');
      stopIdleTimer();
    } else {
      el.appHeader.classList.remove('hidden');
      if (isLiveHosted) {
        startIdleTimer();
      } else {
        stopIdleTimer();
      }
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
    if (el.viewOwnerPortal) el.viewOwnerPortal.classList.toggle('hidden', viewName !== 'owner-portal');
    if (el.viewHostRequest) el.viewHostRequest.classList.toggle('hidden', viewName !== 'host-request');
    if (el.viewRentalStatus) el.viewRentalStatus.classList.toggle('hidden', viewName !== 'rental-status');

    // Quick lock & timer visibility: ONLY show when live/hosted event is active
    const isOwnerTimerDisabled = (viewName === 'owner-portal' && CS_Store.getOwnerLockTimer && CS_Store.getOwnerLockTimer() === 0);
    const showLockControls = isLiveHosted && !isOwnerTimerDisabled;

    el.btnQuickLock.classList.toggle('hidden', !showLockControls);
    el.idleTimerDisplay.classList.toggle('hidden', !showLockControls);

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
    } else if (viewName === 'owner-portal') {
      el.headerEventLabel.textContent = 'Platform Owner • Master SaaS Console';
      if (el.headerStaffPill) el.headerStaffPill.textContent = 'Owner';
      if (typeof CS_Store.initOwnerCloudSync === 'function') {
        CS_Store.initOwnerCloudSync();
      }
      renderOwnerPortal();
    } else if (viewName === 'host-request') {
      el.headerEventLabel.textContent = 'Event Rental Request';
      if (el.headerStaffPill) el.headerStaffPill.textContent = 'Rental';
      renderHostRequestView();
    } else if (viewName === 'rental-status') {
      el.headerEventLabel.textContent = 'Rental License Status';
      if (el.headerStaffPill) el.headerStaffPill.textContent = 'License';
      renderRentalStatusView();
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

  // --- Inactivity Auto-Lock (Configurable Idle Timer) ---
  function startIdleTimer() {
    stopIdleTimer();
    // Requirement 1: Only activate timer after event has been approved and is live/hosted
    if (!isLiveHostedWorkspace()) {
      return;
    }

    let duration = 180; // 3 minutes default
    if (state.currentView === 'owner-portal' || state.role === 'OWNER') {
      duration = CS_Store.getOwnerLockTimer ? CS_Store.getOwnerLockTimer() : 180;
      if (duration === 0) {
        if (el.idleSeconds) el.idleSeconds.textContent = 'OFF';
        return; // Auto-lock disabled for Owner Console
      }
    }
    state.idleSecondsRemaining = duration;
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
    // Requirement 1: Do not reset or track idle activity when in 'Under Review' or 'Pending Request'
    if (!isLiveHostedWorkspace() || el.lockoutScreen.classList.contains('active')) {
      return;
    }
    let duration = 180;
    if (state.currentView === 'owner-portal' || state.role === 'OWNER') {
      duration = CS_Store.getOwnerLockTimer ? CS_Store.getOwnerLockTimer() : 180;
      if (duration === 0) return;
    }
    state.idleSecondsRemaining = duration;
    updateIdleDisplay();
  }

  function updateIdleDisplay() {
    const mins = Math.floor(state.idleSecondsRemaining / 60);
    const secs = state.idleSecondsRemaining % 60;
    el.idleSeconds.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  function lockWorkspace(isRelaunch = false) {
    // Requirement 1: Never trigger lockout screen when in 'Under Review' or 'Pending Request' status
    if (!isLiveHostedWorkspace()) {
      return;
    }
    stopIdleTimer();
    try {
      sessionStorage.removeItem('countersync_session_unlocked');
    } catch (e) {}
    const event = CS_Store.getEvent(state.eventKey);
    const lockoutBox = document.querySelector('.lockout-box');
    if (lockoutBox) lockoutBox.classList.remove('shake');

    const lockoutTitle = document.getElementById('lockout-title');
    const lockoutDesc = document.getElementById('lockout-desc');
    const lockoutHint = document.getElementById('lockout-pin-hint');
    const unlockBtn = document.getElementById('btn-submit-unlock');

    if (state.currentView === 'owner-portal' || state.role === 'OWNER') {
      if (lockoutTitle) lockoutTitle.textContent = 'Owner Console Locked';
      if (lockoutDesc) lockoutDesc.textContent = isRelaunch ? 'Enter Owner PIN to unlock console.' : 'Platform Owner security lock. Enter Owner PIN to resume.';
      if (lockoutHint) lockoutHint.textContent = 'Authorized: safwanvgd313@gmail.com';
      if (unlockBtn) unlockBtn.textContent = 'Unlock Owner Console';
    } else if (state.currentView === 'pos' || state.role === 'POS') {
      const counter = (event && state.counterId) ? CS_Store.getCounter(state.eventKey, state.counterId) : null;
      const counterName = counter ? counter.name : 'Sales Counter';
      if (lockoutTitle) lockoutTitle.textContent = `${counterName} Locked`;
      if (lockoutDesc) lockoutDesc.textContent = isRelaunch ? `Enter ${counterName} PIN to unlock workspace.` : `Workspace locked. Enter ${counterName} PIN to resume.`;
      if (lockoutHint) lockoutHint.textContent = counter ? `Assigned to: ${counter.volunteers}` : '';
      if (unlockBtn) unlockBtn.textContent = `Unlock ${counterName}`;
    } else if (state.currentView === 'stockroom' || state.role === 'STOCKROOM') {
      if (lockoutTitle) lockoutTitle.textContent = 'Stock Room Locked';
      if (lockoutDesc) lockoutDesc.textContent = isRelaunch ? 'Enter Stock Room PIN to unlock warehouse.' : 'Central warehouse locked. Enter Stock Room PIN to resume.';
      const keeper = (event && event.stockRoom) ? (event.stockRoom.keeperName || event.stockRoom.keeper) : 'Vikram Malhotra';
      if (lockoutHint) lockoutHint.textContent = `Keeper: ${keeper}`;
      if (unlockBtn) unlockBtn.textContent = 'Unlock Stock Room Vault';
    } else if (state.currentView === 'admin' || state.role === 'ADMIN') {
      if (lockoutTitle) lockoutTitle.textContent = 'Super Admin Portal Locked';
      if (lockoutDesc) lockoutDesc.textContent = isRelaunch ? 'Enter Super Admin PIN to unlock dashboard.' : 'Organizer dashboard locked. Enter Super Admin PIN to resume.';
      if (lockoutHint) lockoutHint.textContent = 'Organizer Master Access';
      if (unlockBtn) unlockBtn.textContent = 'Unlock Super Admin Portal';
    } else {
      if (lockoutTitle) lockoutTitle.textContent = 'Workspace Locked';
      if (lockoutDesc) lockoutDesc.textContent = isRelaunch ? 'Enter assigned PIN to unlock.' : 'Workspace paused due to inactivity. Enter your assigned PIN.';
      if (lockoutHint) lockoutHint.textContent = '';
      if (unlockBtn) unlockBtn.textContent = 'Unlock Workspace Desk';
    }

    el.lockoutScreen.classList.remove('hidden');
    el.lockoutScreen.classList.add('active');
    el.inputUnlockPin.value = '';
    setTimeout(() => el.inputUnlockPin.focus(), 60);
    CS_Audio.alertWarning();
    if (isRelaunch) {
      showToast('App secured. Enter PIN to unlock dashboard.', 'info');
    } else {
      showToast('Workspace locked due to inactivity', 'error');
    }
  }

  function unlockWorkspace() {
    const enteredPin = el.inputUnlockPin.value.trim();
    const event = CS_Store.getEvent(state.eventKey);

    let valid = false;
    let expectedRoleName = '';

    if (state.currentView === 'owner-portal' || state.role === 'OWNER') {
      expectedRoleName = 'Owner Console';
      const ownerPin = CS_Store.getOwnerPin ? CS_Store.getOwnerPin() : '3130';
      if (enteredPin === String(ownerPin)) {
        valid = true;
      }
    } else if (state.currentView === 'pos' || state.role === 'POS') {
      if (!event) return;
      const counter = state.counterId ? CS_Store.getCounter(state.eventKey, state.counterId) : null;
      expectedRoleName = counter ? counter.name : 'Sales Counter';
      // STRICT: Only this specific counter's PIN is accepted! Super Admin PIN and Stock Room PIN are strictly rejected!
      if (counter && enteredPin === String(counter.pin)) {
        valid = true;
      }
    } else if (state.currentView === 'stockroom' || state.role === 'STOCKROOM') {
      if (!event) return;
      expectedRoleName = 'Stock Room';
      // STRICT: Only Stock Room PIN is accepted!
      if (enteredPin === String(event.stockRoomPin)) {
        valid = true;
      }
    } else if (state.currentView === 'admin' || state.role === 'ADMIN') {
      if (!event) return;
      expectedRoleName = 'Super Admin';
      // STRICT: Only Super Admin PIN or 9999 is accepted!
      if (enteredPin === String(event.adminPin) || enteredPin === '9999') {
        valid = true;
      }
    }

    if (valid) {
      try {
        sessionStorage.setItem('countersync_session_unlocked', 'true');
        localStorage.removeItem('countersync_app_closed_lock');
      } catch (e) {}
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

    // Google & Multi-Tenant Authentication Dispatcher
    async function handleAuthenticatedUser(user) {
      if (!user || !user.email) return;
      state.currentUser = user;
      const email = (user.email || '').toLowerCase().trim();

      // 1. Master Check: Is user Safwan (Platform Owner)?
      if (CS_Store.isPlatformOwner(email)) {
        state.role = 'OWNER';
        state.eventKey = state.eventKey || 'CS2026';
        CS_Store.setSession({
          role: 'OWNER',
          eventKey: state.eventKey,
          user: {
            displayName: user.displayName || 'Safwan',
            email: user.email,
            photoURL: user.photoURL,
            uid: user.uid,
            isOwner: true
          }
        });
        if (typeof CS_Audio !== 'undefined' && CS_Audio.handshakeSuccess) {
          CS_Audio.handshakeSuccess();
        }
        showToast('Welcome Safwan! Authenticated as Platform Owner.', 'success');
        navigateTo('owner-portal');
        return;
      }

      // 2. Tenant Check: Check rental license registry
      const rental = CS_Store.getRentalByEmail(email);

      if (!rental) {
        showToast(`Google account verified (${user.email}). Please complete your event rental request.`, 'info');
        navigateTo('host-request');
        return;
      }

      state.currentRental = rental;

      if (rental.status === 'PENDING') {
        navigateTo('rental-status');
        return;
      }

      if (rental.status === 'DENIED' || rental.status === 'SUSPENDED') {
        navigateTo('rental-status');
        return;
      }

      if (rental.status === 'ACTIVE') {
        // Check expiration date
        if (rental.expiresAt && new Date() > new Date(rental.expiresAt)) {
          navigateTo('rental-status');
          return;
        }

        state.role = 'ADMIN';
        state.eventKey = rental.eventKey;
        CS_Store.setSession({
          role: 'ADMIN',
          eventKey: rental.eventKey,
          user: {
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            uid: user.uid
          }
        });
        CS_Store.initCloudSync(rental.eventKey);
        if (typeof CS_Audio !== 'undefined' && CS_Audio.handshakeSuccess) {
          CS_Audio.handshakeSuccess();
        }
        showToast(`Welcome ${user.displayName || user.email}! Connected to ${rental.eventName}`, 'success');
        navigateTo('admin');
      }
    }

    // Google Sign-In & Organizer Host Event Flow (Debounced to prevent double triggers on touch)
    let isAuthActionRunning = false;
    async function handleHostEventClick() {
      if (isAuthActionRunning) return;
      isAuthActionRunning = true;

      try {
        if (window.CS_Firebase && (window.CS_Firebase.isReady || typeof window.CS_Firebase.signInWithGoogle === 'function')) {
          showToast('Connecting to Google Identity Services...', 'info');
          const user = await window.CS_Firebase.signInWithGoogle();
          if (user) {
            await handleAuthenticatedUser(user);
            return;
          }
          // If user is null, full-page redirect is currently navigating to Google
          if (sessionStorage.getItem('cs_auth_redirect_in_progress') === 'true' || localStorage.getItem('cs_auth_redirect_in_progress') === 'true') {
            return;
          }
        } else {
          showToast('Google Authentication service is connecting. Please check your internet connection.', 'warning');
        }
      } catch (err) {
        console.warn("Google Sign-In notice:", err);
        showToast(err.message || 'Google Sign-In canceled', 'error', 8000);
      } finally {
        setTimeout(() => { isAuthActionRunning = false; }, 1500);
      }
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
    }

    // Dual Intent Click - Host an Event (Organizer)
    if (el.cardIntentOrganizer) {
      el.cardIntentOrganizer.addEventListener('click', (e) => {
        e.preventDefault();
        handleHostEventClick();
      });
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
      el.btnGoogleAuth.addEventListener('click', async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        await handleHostEventClick();
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

    // Rental License Validation Check
    const license = CS_Store.isEventLicenseValid(rawKey);
    if (!license.valid) {
      if (typeof CS_Audio !== 'undefined' && CS_Audio.alertWarning) CS_Audio.alertWarning();
      showToast(`Access Denied: ${license.reason}. Contact your event organizer or safwanvgd313@gmail.com.`, 'error');
      if (el.scopedCounterPicker) el.scopedCounterPicker.classList.add('hidden');
      if (el.joinStepBadge) el.joinStepBadge.textContent = 'Step 1 of 2';
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

    // Streamlined Tip / Donation Modal (Section 1.1)
    function openTipDonationModal() {
      const modal = document.getElementById('modal-tip-donation');
      const amtInput = document.getElementById('donation-modal-amount');
      const donorInput = document.getElementById('donation-modal-donor');
      const btnCash = document.getElementById('btn-donation-mode-cash');
      const btnGpay = document.getElementById('btn-donation-mode-gpay');

      if (amtInput) amtInput.value = '';
      if (donorInput) donorInput.value = '';
      state.donationModalPayMode = 'CASH';

      if (btnCash) btnCash.classList.add('active');
      if (btnGpay) btnGpay.classList.remove('active');

      if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => {
          if (amtInput) amtInput.focus();
        }, 60);
      }
    }

    if (el.btnToggleDonationPane) {
      el.btnToggleDonationPane.addEventListener('click', () => {
        openTipDonationModal();
      });
    }

    const btnDonationCash = document.getElementById('btn-donation-mode-cash');
    const btnDonationGpay = document.getElementById('btn-donation-mode-gpay');
    if (btnDonationCash) {
      btnDonationCash.addEventListener('click', () => {
        state.donationModalPayMode = 'CASH';
        btnDonationCash.classList.add('active');
        if (btnDonationGpay) btnDonationGpay.classList.remove('active');
        triggerHaptic('light');
      });
    }
    if (btnDonationGpay) {
      btnDonationGpay.addEventListener('click', () => {
        state.donationModalPayMode = 'UPI';
        btnDonationGpay.classList.add('active');
        if (btnDonationCash) btnDonationCash.classList.remove('active');
        triggerHaptic('light');
      });
    }

    const btnSubmitDonation = document.getElementById('btn-submit-donation');
    if (btnSubmitDonation) {
      btnSubmitDonation.addEventListener('click', () => {
        const amtInput = document.getElementById('donation-modal-amount');
        const donorInput = document.getElementById('donation-modal-donor');
        const amt = amtInput ? parseInt(amtInput.value, 10) : 0;
        const donor = (donorInput ? donorInput.value.trim() : '') || 'Anonymous Donor';
        const mode = state.donationModalPayMode || 'CASH';

        if (isNaN(amt) || amt <= 0) {
          CS_Audio.alertWarning();
          showToast('Please enter a valid donation amount (₹)', 'error');
          if (amtInput) amtInput.focus();
          return;
        }

        try {
          CS_Store.recordDonation({
            eventKey: state.eventKey,
            counterId: state.counterId,
            amount: amt,
            donorName: donor,
            paymentMode: mode === 'UPI' ? 'UPI' : 'CASH',
            notes: mode === 'UPI' ? 'Direct G-Pay Tip/Donation' : 'Direct Cash Tip/Donation'
          });

          const modal = document.getElementById('modal-tip-donation');
          if (modal) modal.classList.add('hidden');

          CS_Audio.handshakeSuccess();
          showToast(`Recorded ₹${amt} Tip/Donation (${mode === 'UPI' ? 'G-Pay' : 'Cash'}) from ${donor}`, 'success');
          renderPOSWorkspace();
          if (state.activeDockTab === 'history') {
            renderCounterShiftLedger();
          }
        } catch (err) {
          CS_Audio.alertWarning();
          showToast(err.message, 'error');
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

    // Deposit Collection to Stockroom (End of Day Tab)
    const btnOpenDepositStockroom = document.getElementById('btn-open-deposit-stockroom');
    if (btnOpenDepositStockroom) {
      btnOpenDepositStockroom.addEventListener('click', openDepositStockroomModal);
    }
    const btnDepositAllCash = document.getElementById('btn-deposit-all-cash');
    if (btnDepositAllCash) {
      btnDepositAllCash.addEventListener('click', () => {
        const metrics = CS_Store.getBalancedLedgerMetrics(state.eventKey, 'ALL');
        const brk = metrics ? (metrics.counterBreakdown || []).find(b => b.id === state.counterId) : null;
        const cash = brk ? brk.cashCollection : 0;
        const amtInput = document.getElementById('deposit-stockroom-amount');
        if (amtInput) amtInput.value = cash;
      });
    }
    const btnConfirmDeposit = document.getElementById('btn-confirm-deposit-stockroom');
    if (btnConfirmDeposit) {
      btnConfirmDeposit.addEventListener('click', handleConfirmDepositStockroom);
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

  function openUpiQrModal(counter, grandTotal) {
    if (!el.modalUpiQr) return;
    const activeCounter = counter || CS_Store.getCounter(state.eventKey, state.counterId);
    const event = CS_Store.getEvent(state.eventKey);
    const upiId = (activeCounter && activeCounter.upiId)
      ? activeCounter.upiId
      : (event && event.upiId ? event.upiId : 'cs.counter01a@okhdfcbank');
    const payeeName = (activeCounter && (activeCounter.upiName || activeCounter.name))
      ? (activeCounter.upiName || activeCounter.name)
      : (event && event.name ? event.name : 'CounterSync POS');
    const amountVal = Number(grandTotal || 0);
    const amountStr = amountVal.toFixed(2);
    const note = `${state.eventKey || 'CounterSync'} ${activeCounter ? activeCounter.name : 'Counter'} Sale`;

    // Standard NPCI / RBI UPI payment intent URI
    const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${amountStr}&cu=INR&tn=${encodeURIComponent(note)}`;
    state.activeUpiUri = upiUri;

    if (el.qrModalAmount) {
      el.qrModalAmount.textContent = `₹${amountVal.toLocaleString('en-IN')}`;
    }
    if (el.qrModalUpiId) {
      el.qrModalUpiId.textContent = upiId;
    }

    const qrContainer = el.upiQrRenderBox || document.getElementById('upi-qr-render-box');
    if (qrContainer) {
      qrContainer.innerHTML = '';
      if (typeof QRCode !== 'undefined') {
        try {
          state.activeUpiQrCode = new QRCode(qrContainer, {
            text: upiUri,
            width: 220,
            height: 220,
            colorDark: '#0B132B',
            colorLight: '#FFFFFF',
            correctLevel: (typeof QRCode !== 'undefined' && QRCode.CorrectLevel) ? QRCode.CorrectLevel.M : 0
          });
        } catch (err) {
          console.error("QR render error:", err);
          qrContainer.innerHTML = `<div style="padding:20px; font-size:0.85rem; color:var(--text-muted);">Scan via UPI ID: <strong>${upiId}</strong><br><small>Amount: ₹${amountStr}</small></div>`;
        }
      } else {
        qrContainer.innerHTML = `<div style="padding:20px; font-size:0.85rem; color:var(--text-muted);">UPI ID: <strong>${upiId}</strong></div>`;
      }
    }

    function handleUpiKeydown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        document.removeEventListener('keydown', handleUpiKeydown);
        if (el.modalUpiQr) el.modalUpiQr.classList.add('hidden');
      }
    }
    document.addEventListener('keydown', handleUpiKeydown);

    el.modalUpiQr.classList.remove('hidden');
    if (typeof CS_Audio !== 'undefined' && CS_Audio.playTone) {
      CS_Audio.playTone(600, 'sine', 0.1);
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

  // End of Day Collection Deposit to Stock Room Handlers
  function openDepositStockroomModal() {
    const modal = document.getElementById('modal-deposit-stockroom');
    const counter = CS_Store.getCounter(state.eventKey, state.counterId);
    if (!modal || !counter) return;

    const metrics = CS_Store.getBalancedLedgerMetrics(state.eventKey, 'ALL');
    const brk = metrics ? (metrics.counterBreakdown || []).find(b => b.id === counter.id) : null;
    const availableCash = brk ? brk.cashCollection : 0;

    const valEl = document.getElementById('deposit-avail-cash-val');
    if (valEl) valEl.textContent = `₹${availableCash.toLocaleString('en-IN')}`;

    const amtInput = document.getElementById('deposit-stockroom-amount');
    if (amtInput) amtInput.value = availableCash > 0 ? availableCash : '';

    const staffInput = document.getElementById('deposit-stockroom-staff');
    if (staffInput) staffInput.value = counter.volunteers ? counter.volunteers.split(',')[0].trim() : 'Counter Staff';

    const notesInput = document.getElementById('deposit-stockroom-notes');
    if (notesInput) notesInput.value = 'End of day cash collection deposit';

    modal.classList.remove('hidden');
    if (amtInput) setTimeout(() => amtInput.focus(), 60);
  }

  function handleConfirmDepositStockroom() {
    const amtInput = document.getElementById('deposit-stockroom-amount');
    const staffInput = document.getElementById('deposit-stockroom-staff');
    const notesInput = document.getElementById('deposit-stockroom-notes');
    const modal = document.getElementById('modal-deposit-stockroom');

    const amount = parseInt(amtInput ? amtInput.value : 0, 10);
    const staff = staffInput ? staffInput.value.trim() : 'Counter Staff';
    const notes = notesInput ? notesInput.value.trim() : 'End of day cash collection deposit';

    if (isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid deposit amount (> 0)', 'error');
      if (amtInput) amtInput.focus();
      return;
    }

    const metrics = CS_Store.getBalancedLedgerMetrics(state.eventKey, 'ALL');
    const brk = metrics ? (metrics.counterBreakdown || []).find(b => b.id === state.counterId) : null;
    const availableCash = brk ? brk.cashCollection : 0;

    if (amount > availableCash) {
      showToast(`Cannot deposit ₹${amount}! Available cash drawer balance is ₹${availableCash}.`, 'error');
      if (amtInput) amtInput.focus();
      return;
    }

    try {
      CS_Store.initiateInterCounterTransfer({
        eventKey: state.eventKey,
        fromCounterId: state.counterId,
        toCounterId: 'stockroom',
        type: 'CASH',
        amountOrQuantity: amount,
        notes,
        authorizedBy: staff
      });

      if (modal) modal.classList.add('hidden');
      CS_Audio.handshakeSuccess();
      showToast(`₹${amount.toLocaleString('en-IN')} cash collection sent to Central Stockroom! Pending acceptance.`, 'success');
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

    // 1. Calculate Shift Donations for Active Counter (Requirement 3: Summary Badges)
    const counterDonations = (event.donations || []).filter(d => d.counter_id === state.counterId);
    let cashDonations = 0;
    let gpayDonations = 0;
    counterDonations.forEach(d => {
      const mode = (d.payment_mode || 'CASH').toUpperCase();
      if (mode.includes('UPI') || mode.includes('GPAY')) {
        gpayDonations += (Number(d.amount) || 0);
      } else {
        cashDonations += (Number(d.amount) || 0);
      }
    });

    // Also include excess change / tips embedded in sales transactions
    (event.transactions || []).forEach(t => {
      if (t.counterId === state.counterId && !t.voided && t.donationAmount > 0 && t.type !== 'DONATION') {
        const mode = (t.paymentMode || 'CASH').toUpperCase();
        if (mode.includes('UPI') || mode.includes('GPAY')) {
          gpayDonations += (Number(t.donationAmount) || 0);
        } else {
          cashDonations += (Number(t.donationAmount) || 0);
        }
      }
    });

    const totalDonations = cashDonations + gpayDonations;
    const elTotDonations = document.getElementById('history-total-donations');
    const elDonBreakdown = document.getElementById('history-donations-breakdown');
    if (elTotDonations) elTotDonations.textContent = `₹${totalDonations.toLocaleString('en-IN')}`;
    if (elDonBreakdown) elDonBreakdown.textContent = `Cash: ₹${cashDonations.toLocaleString('en-IN')} | G-Pay: ₹${gpayDonations.toLocaleString('en-IN')}`;

    // 2. Calculate Incoming Transfers Received at this Counter
    const incomingTransfers = (event.transfers || []).filter(tr => 
      (tr.toCounterId === state.counterId || tr.to_counter === state.counterId) && 
      (tr.status === 'ACCEPTED' || tr.status === 'COMPLETED')
    );
    const inBooks = incomingTransfers.filter(tr => tr.type === 'BOOKS').reduce((s, tr) => s + (Number(tr.copies || tr.amountOrQuantity || tr.amount_or_quantity) || 0), 0);
    const inCash = incomingTransfers.filter(tr => tr.type === 'CASH').reduce((s, tr) => s + (Number(tr.cashAmount || tr.amountOrQuantity || tr.amount_or_quantity) || 0), 0);

    const elInTransfers = document.getElementById('history-incoming-transfers');
    const elTrBreakdown = document.getElementById('history-transfers-breakdown');
    if (elInTransfers) elInTransfers.textContent = `+${inBooks} bks / ₹${inCash.toLocaleString('en-IN')}`;
    if (elTrBreakdown) elTrBreakdown.textContent = `Books: +${inBooks} | Cash: ₹${inCash.toLocaleString('en-IN')}`;

    // 3. Compile Unified Chronological Activity Stream (Sale, Donation, Transfer Sent, Transfer Received)
    const activityItems = [];

    // Sales & VIP & Direct Donations recorded in transactions
    (event.transactions || []).forEach(t => {
      if (t.counterId === state.counterId) {
        activityItems.push({
          kind: 'TXN',
          id: t.id,
          timestamp: t.timestamp,
          type: t.type || (t.copies === 0 && t.donationAmount > 0 ? 'DONATION' : 'SALE'),
          copies: t.copies || 0,
          amount: t.totalAmount || 0,
          donationAmount: t.donationAmount || 0,
          buyerName: t.buyerName,
          paymentMode: t.paymentMode || 'CASH',
          voided: !!t.voided
        });
      }
    });

    // Inter-Counter Transfers involving this counter
    (event.transfers || []).forEach(tr => {
      const isFrom = (tr.fromCounterId === state.counterId || tr.from_counter === state.counterId);
      const isTo = (tr.toCounterId === state.counterId || tr.to_counter === state.counterId);
      if (isFrom) {
        activityItems.push({
          kind: 'TRANSFER_SENT',
          id: tr.id || tr.transfer_id,
          timestamp: tr.initiated_at || tr.timestamp,
          transferType: tr.type,
          copies: tr.copies || (tr.type === 'BOOKS' ? (tr.amountOrQuantity || tr.amount_or_quantity || 0) : 0),
          amount: tr.cashAmount || (tr.type === 'CASH' ? (tr.amountOrQuantity || tr.amount_or_quantity || 0) : 0),
          targetName: tr.toCounterName || tr.toCounterId || tr.to_counter,
          status: tr.status || 'PENDING',
          notes: tr.notes || ''
        });
      } else if (isTo) {
        activityItems.push({
          kind: 'TRANSFER_RECEIVED',
          id: tr.id || tr.transfer_id,
          timestamp: tr.resolved_at || tr.initiated_at || tr.timestamp,
          transferType: tr.type,
          copies: tr.copies || (tr.type === 'BOOKS' ? (tr.amountOrQuantity || tr.amount_or_quantity || 0) : 0),
          amount: tr.cashAmount || (tr.type === 'CASH' ? (tr.amountOrQuantity || tr.amount_or_quantity || 0) : 0),
          senderName: tr.fromCounterName || tr.fromCounterId || tr.from_counter,
          status: tr.status || 'PENDING',
          notes: tr.notes || ''
        });
      }
    });

    // Sort newest first
    activityItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (countEl) countEl.textContent = `${activityItems.length} ${activityItems.length === 1 ? 'record' : 'records'}`;
    container.innerHTML = '';

    if (activityItems.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 28px; color: var(--text-muted); font-size: 0.9rem;">No transactions or transfers recorded on this counter shift yet.</div>`;
      return;
    }

    activityItems.forEach(item => {
      const card = document.createElement('div');
      card.className = `history-txn-card ${item.voided ? 'voided' : ''}`;
      const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (item.kind === 'TXN') {
        const isDonation = item.type === 'DONATION' || (item.copies === 0 && item.donationAmount > 0);
        const isVip = item.type === 'VIP' || item.type === 'VAULT_GIVEAWAY';

        let badgeClass = 'history-badge-green';
        let badgeText = `+${item.copies}`;
        let titleText = item.buyerName || 'Direct Buyer';
        let costText = `₹${item.amount.toLocaleString('en-IN')}`;
        let metaText = `${timeStr} • ${item.paymentMode}`;

        if (isDonation) {
          badgeClass = 'history-badge-pink';
          badgeText = '❤️ Tip';
          titleText = item.buyerName || 'Patron Donor';
          costText = `₹${(item.donationAmount || item.amount).toLocaleString('en-IN')}`;
        } else if (isVip) {
          badgeClass = 'history-badge-purple';
          badgeText = '👑 VIP';
          titleText = item.buyerName || 'Dignitary Handover';
          costText = 'Free VIP';
        }

        card.innerHTML = `
          <div class="history-txn-left">
            <div class="${badgeClass}" style="${isDonation ? 'background: rgba(219, 39, 119, 0.12); color: #DB2777;' : (isVip ? 'background: rgba(147, 51, 234, 0.12); color: #9333EA;' : '')}">
              ${badgeText}
            </div>
            <div>
              <div class="history-txn-buyer">${titleText}</div>
              <div class="history-txn-time">${metaText}</div>
            </div>
          </div>
          <div class="history-txn-right">
            <div class="history-txn-cost" style="${isDonation ? 'color: #DB2777;' : (isVip ? 'color: #9333EA; font-size: 0.88rem;' : '')}">
              ${costText}
            </div>
            ${item.voided ? `
              <span style="font-size:0.75rem; color:#EF4444; font-weight:800;">Cancelled</span>
            ` : `
              <button type="button" class="btn-cancel-void-pill" data-void-id="${item.id}">↺ Cancel</button>
            `}
          </div>
        `;

        card.querySelectorAll('.btn-cancel-void-pill').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openVoidDialog(item.id);
          });
        });
      } else if (item.kind === 'TRANSFER_SENT') {
        const itemVal = item.transferType === 'CASH' ? `₹${item.amount}` : `${item.copies} bks`;
        const statusColors = {
          PENDING: '#F59E0B',
          ACCEPTED: '#10B981',
          REJECTED: '#EF4444'
        };
        const statusColor = statusColors[item.status] || '#F59E0B';

        card.innerHTML = `
          <div class="history-txn-left">
            <div style="width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: rgba(245, 158, 11, 0.12); color: #D97706; font-size: 1.05rem; font-weight: 800;">
              ↗️
            </div>
            <div>
              <div class="history-txn-buyer">Transfer Sent to ${item.targetName}</div>
              <div class="history-txn-time">${timeStr} • ${item.transferType === 'CASH' ? 'Cash Float' : 'Book Stock'}${item.notes ? ' • "' + item.notes + '"' : ''}</div>
            </div>
          </div>
          <div class="history-txn-right">
            <div class="history-txn-cost" style="color: #D97706; font-size: 0.95rem;">-${itemVal}</div>
            <span style="font-size: 0.72rem; font-weight: 800; color: ${statusColor}; text-transform: uppercase;">${item.status}</span>
          </div>
        `;
      } else if (item.kind === 'TRANSFER_RECEIVED') {
        const itemVal = item.transferType === 'CASH' ? `₹${item.amount}` : `+${item.copies} bks`;
        const statusColors = {
          PENDING: '#F59E0B',
          ACCEPTED: '#10B981',
          REJECTED: '#EF4444'
        };
        const statusColor = statusColors[item.status] || '#F59E0B';

        card.innerHTML = `
          <div class="history-txn-left">
            <div style="width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: rgba(0, 102, 255, 0.12); color: #0066FF; font-size: 1.05rem; font-weight: 800;">
              ↙️
            </div>
            <div>
              <div class="history-txn-buyer">Transfer Received from ${item.senderName}</div>
              <div class="history-txn-time">${timeStr} • ${item.transferType === 'CASH' ? 'Cash Float' : 'Book Stock'}${item.notes ? ' • "' + item.notes + '"' : ''}</div>
            </div>
          </div>
          <div class="history-txn-right">
            <div class="history-txn-cost" style="color: #0066FF; font-size: 0.95rem;">${itemVal}</div>
            <span style="font-size: 0.72rem; font-weight: 800; color: ${statusColor}; text-transform: uppercase;">${item.status}</span>
          </div>
        `;
      }

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
    if (expectedCashEl) {
      expectedCashEl.textContent = `₹${expectedCash.toLocaleString('en-IN')}`;
      expectedCashEl.dataset.expected = expectedCash;
    }

    const expectedCashSummaryEl = document.getElementById('recon-expected-cash-summary');
    if (expectedCashSummaryEl) {
      expectedCashSummaryEl.textContent = `₹${expectedCash.toLocaleString('en-IN')}`;
    }

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
    const expectedEl = document.getElementById('recon-expected-cash');
    const expected = parseInt(expectedEl ? (expectedEl.dataset.expected || expectedEl.textContent.replace(/[^\d]/g, '')) : 0, 10) || 0;
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

    // 3.6 Submit Cash Float Transfer to Counter
    const btnSubmitCashTransfer = document.getElementById('btn-submit-sr-cash-transfer');
    if (btnSubmitCashTransfer) {
      btnSubmitCashTransfer.addEventListener('click', () => {
        const targetSelect = document.getElementById('sr-cash-target-counter');
        const toCounterId = targetSelect ? targetSelect.value : '';
        const amtInput = document.getElementById('sr-cash-transfer-amount');
        const notesInput = document.getElementById('sr-cash-transfer-notes');
        const amount = parseInt(amtInput ? amtInput.value : 0, 10);
        const notes = notesInput ? notesInput.value.trim() : 'Opening cash float';

        if (!toCounterId) {
          showToast('Select destination counter for cash transfer', 'error');
          return;
        }
        if (isNaN(amount) || amount <= 0) {
          showToast('Enter a valid transfer amount (> 0)', 'error');
          return;
        }

        try {
          CS_Store.initiateInterCounterTransfer({
            eventKey: state.eventKey,
            fromCounterId: 'stockroom',
            toCounterId,
            type: 'CASH',
            amountOrQuantity: amount,
            notes,
            authorizedBy: 'Stock Room Keeper'
          });
          CS_Audio.handshakeSuccess();
          showToast(`Disbursed ₹${amount} cash float! Awaiting counter handshake.`, 'success');
          if (amtInput) amtInput.value = '1000';
          renderStockRoomWorkspace();
        } catch (err) {
          CS_Audio.alertWarning();
          showToast(err.message, 'error');
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

    // Populate cash target counter select
    const cashTargetSelect = document.getElementById('sr-cash-target-counter');
    if (cashTargetSelect) {
      cashTargetSelect.innerHTML = '';
      (event.counters || []).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name} (${c.volunteers || 'Staff'})`;
        cashTargetSelect.appendChild(opt);
      });
    }

    // Compute Metrics
    const metrics = CS_Store.getBalancedLedgerMetrics(state.eventKey, 'ALL');

    document.getElementById('sr-kpi-inflow').textContent = metrics.netPressInflow.toLocaleString('en-IN');
    document.getElementById('sr-kpi-reserve').textContent = metrics.reserveInStockRoom.toLocaleString('en-IN');
    const totalDistributed = metrics.activeCountersStock + metrics.totalCopiesSold + (metrics.counterVipCopies || 0) + (metrics.inTransitStock || 0);
    document.getElementById('sr-kpi-distributed').textContent = totalDistributed.toLocaleString('en-IN');
    document.getElementById('sr-kpi-giveaway').textContent = metrics.totalVIPCopies.toLocaleString('en-IN');

    // Stock Room Cash Vault KPI
    const srCashVaultEl = document.getElementById('sr-kpi-cash-vault');
    if (srCashVaultEl) srCashVaultEl.textContent = `₹${(metrics.stockRoomCash || 0).toLocaleString('en-IN')}`;
    const srTotalVaultCashEl = document.getElementById('sr-total-vault-cash');
    if (srTotalVaultCashEl) srTotalVaultCashEl.textContent = `₹${(metrics.stockRoomCash || 0).toLocaleString('en-IN')}`;

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

    // Counter Cash Deposits & Float Transfers Table
    const stockroomTransfers = CS_Store.getAllTransfersForStockRoom(state.eventKey) || [];
    const pendingStockroomCash = stockroomTransfers.filter(t => (t.toCounterId === 'stockroom' || t.to_counter === 'stockroom') && t.status === 'PENDING').length;
    const srPendingCashPill = document.getElementById('sr-pending-cash-count');
    if (srPendingCashPill) {
      srPendingCashPill.textContent = `${pendingStockroomCash} Pending`;
      srPendingCashPill.style.background = pendingStockroomCash > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)';
      srPendingCashPill.style.color = pendingStockroomCash > 0 ? '#EF4444' : '#10B981';
    }

    const cashTbody = document.getElementById('sr-cash-transfers-tbody');
    if (cashTbody) {
      cashTbody.innerHTML = '';
      if (stockroomTransfers.length === 0) {
        cashTbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--text-muted); padding: 18px;">No cash collection deposits or float transfers recorded yet.</td></tr>`;
      } else {
        stockroomTransfers.forEach(t => {
          const isDeposit = (t.toCounterId === 'stockroom' || t.to_counter === 'stockroom');
          const counterName = isDeposit ? (t.fromCounterName || t.fromCounterId) : (t.toCounterName || t.toCounterId);
          const tr = document.createElement('tr');
          const isPending = t.status === 'PENDING';
          const isAccepted = t.status === 'ACCEPTED';
          const isRejected = t.status === 'REJECTED';

          let statusColor = isAccepted ? '#10B981' : (isRejected ? '#EF4444' : '#F59E0B');

          let actionCell = '<span style="color: var(--text-muted); font-size: 0.8rem;">Completed</span>';
          if (isDeposit && isPending) {
            actionCell = `
              <div style="display: flex; gap: 6px;">
                <button type="button" class="btn-pill sr-btn-accept-cash" data-tid="${t.id || t.transfer_id}" style="background: rgba(16, 185, 129, 0.2); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 0.76rem; font-weight: 700; padding: 4px 10px; cursor: pointer;">
                  ✓ Accept
                </button>
                <button type="button" class="btn-pill sr-btn-reject-cash" data-tid="${t.id || t.transfer_id}" style="background: rgba(239, 68, 68, 0.15); color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.3); font-size: 0.76rem; font-weight: 700; padding: 4px 8px; cursor: pointer;">
                  ✕ Reject
                </button>
              </div>
            `;
          } else if (!isDeposit && isPending) {
            actionCell = '<em style="color: var(--text-muted); font-size: 0.78rem;">Awaiting Counter</em>';
          }

          tr.innerHTML = `
            <td><strong>${t.id || t.transfer_id}</strong></td>
            <td>
              <span style="font-weight: 700; color: ${isDeposit ? '#10B981' : '#0066FF'};">
                ${isDeposit ? '📥 Counter Deposit' : '📤 Float Outflow'}
              </span>
            </td>
            <td><strong>${counterName}</strong></td>
            <td><strong style="color: ${isDeposit ? '#10B981' : '#0066FF'}; font-size: 1.05rem;">₹${(t.cashAmount || t.amountOrQuantity || 0).toLocaleString('en-IN')}</strong></td>
            <td>${new Date(t.timestamp || t.initiated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
            <td><span class="stock-pill" style="color: ${statusColor}; border-color: ${statusColor}; font-size: 0.74rem;">${t.status}</span></td>
            <td>
              <span style="font-size: 0.82rem;">${t.notes || 'Cash transfer'}</span><br>
              <span style="font-size: 0.72rem; color: var(--text-muted);">By: ${t.authorizedBy || 'Staff'}</span>
            </td>
            <td>${actionCell}</td>
          `;

          const btnAccept = tr.querySelector('.sr-btn-accept-cash');
          if (btnAccept) {
            btnAccept.addEventListener('click', () => {
              try {
                CS_Store.respondInterCounterTransfer({
                  eventKey: state.eventKey,
                  transferId: t.id || t.transfer_id,
                  action: 'ACCEPT',
                  responderName: 'Stock Room Keeper'
                });
                CS_Audio.handshakeSuccess();
                showToast(`Accepted ₹${t.cashAmount || t.amountOrQuantity} cash deposit into Central Vault!`, 'success');
                renderStockRoomWorkspace();
              } catch (e) {
                CS_Audio.alertWarning();
                showToast(e.message, 'error');
              }
            });
          }

          const btnReject = tr.querySelector('.sr-btn-reject-cash');
          if (btnReject) {
            btnReject.addEventListener('click', () => {
              try {
                CS_Store.respondInterCounterTransfer({
                  eventKey: state.eventKey,
                  transferId: t.id || t.transfer_id,
                  action: 'REJECT',
                  responderName: 'Stock Room Keeper'
                });
                CS_Audio.playTone(300, 'square', 0.15);
                showToast(`Rejected deposit of ₹${t.cashAmount || t.amountOrQuantity}. Returned to ${counterName}.`, 'info');
                renderStockRoomWorkspace();
              } catch (e) {
                CS_Audio.alertWarning();
                showToast(e.message, 'error');
              }
            });
          }

          cashTbody.appendChild(tr);
        });
      }
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

  // --- 5. Platform Owner Portal (Safwan Exclusive Console) ---
  function renderOwnerPortal() {
    const rentals = CS_Store.getPlatformRentals();
    const data = CS_Store.getData();

    // 1. KPI Aggregation (Requirement 5: Active Events Counter & Pending Applications only)
    const pendingRentals = rentals.filter(r => r.status === 'PENDING');
    const pendingCount = pendingRentals.length;

    // Determine all active hosted running events across cloud & local data
    const activeRentals = rentals.filter(r => r.status === 'ACTIVE');
    const localEventKeys = Object.keys(data.events || {});
    const rentalEventKeys = activeRentals.map(r => (r.eventKey || '').toUpperCase().trim()).filter(Boolean);
    const allRunningKeys = Array.from(new Set([...localEventKeys, ...rentalEventKeys])).filter(k => k.length > 0);
    const activeCount = allRunningKeys.length;

    const elPending = document.getElementById('owner-kpi-pending');
    const elActive = document.getElementById('owner-kpi-active');
    const elInboxCounter = document.getElementById('owner-inbox-counter');
    const elEventsCounter = document.getElementById('owner-events-counter');

    if (elPending) elPending.textContent = pendingCount;
    if (elActive) elActive.textContent = activeCount;
    if (elInboxCounter) elInboxCounter.textContent = pendingCount;
    if (elEventsCounter) elEventsCounter.textContent = activeCount;

    // 2. Render Host Approval Queue (Applications awaiting review)
    const listEl = document.getElementById('owner-rental-requests-list');
    if (listEl) {
      if (rentals.length === 0) {
        listEl.innerHTML = `<div style="text-align: center; padding: 36px 20px; color: var(--text-muted); font-size: 0.95rem;">
          <div style="font-size: 2rem; margin-bottom: 8px;">📬</div>
          <strong>No rental applications in queue</strong>
          <div style="font-size: 0.82rem; margin-top: 4px;">Incoming event host applications will automatically appear here in real time.</div>
        </div>`;
      } else {
        // Prioritize PENDING requests at top of queue
        const sortedRentals = [...rentals].sort((a, b) => {
          if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
          if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
          return new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0);
        });

        listEl.innerHTML = sortedRentals.map(r => {
          const statusClass = (r.status || 'pending').toLowerCase();
          const isPending = r.status === 'PENDING';
          const isActive = r.status === 'ACTIVE';
          const isExpired = r.expiresAt && new Date() > new Date(r.expiresAt);
          const expiryText = r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : 'None';

          return `
            <div class="rental-item-card" style="${isPending ? 'border-left: 4px solid #F59E0B;' : ''}">
              <div class="rental-card-header">
                <div>
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="font-weight: 800; font-size: 1.05rem;">${r.eventName || 'Unnamed Event'}</span>
                    <span class="font-mono" style="background: rgba(0,102,255,0.12); color: #0066FF; font-weight: 800; padding: 2px 8px; border-radius: 6px; font-size: 0.80rem;">${r.eventKey || 'TBD'}</span>
                  </div>
                  <div style="font-size: 0.82rem; color: var(--text-secondary);">
                    <strong>${r.hostName || 'Host'}</strong> • ${r.organization || 'Org'} • <a href="mailto:${r.hostEmail}" style="color: #0066FF; text-decoration: none;">${r.hostEmail}</a>
                  </div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                  <span class="rental-badge ${isExpired && isActive ? 'expired' : statusClass}">
                    ${isExpired && isActive ? 'EXPIRED' : r.status}
                  </span>
                </div>
              </div>

              <div class="rental-meta-grid">
                <div class="rental-meta-cell">
                  <span class="rental-meta-title">Requested Dates</span>
                  <span class="rental-meta-val">${r.startsAt ? new Date(r.startsAt).toLocaleDateString() : 'ASAP'} → ${expiryText}</span>
                </div>
                <div class="rental-meta-cell">
                  <span class="rental-meta-title">Counters Quota</span>
                  <span class="rental-meta-val">${r.allowedCounters || 3} Desks</span>
                </div>
                <div class="rental-meta-cell">
                  <span class="rental-meta-title">Book & Price</span>
                  <span class="rental-meta-val">${r.bookTitle || 'Book'} (₹${r.unitPrice || 100})</span>
                </div>
                <div class="rental-meta-cell">
                  <span class="rental-meta-title">Contact Phone</span>
                  <span class="rental-meta-val">${r.phone ? `<a href="https://wa.me/${r.phone.replace(/[^0-9]/g, '')}" target="_blank" style="color: #10B981; text-decoration: none;">📱 ${r.phone}</a>` : 'Not provided'}</span>
                </div>
              </div>

              ${r.notes ? `<div style="font-size: 0.78rem; color: var(--text-secondary); background: var(--bg-surface); padding: 8px 12px; border-radius: 8px; margin-bottom: 10px;"><strong>Notes:</strong> ${r.notes}</div>` : ''}

              <div class="rental-actions-row">
                ${isPending ? `
                  <button class="btn-pill btn-pill-primary" onclick="window.openRentalApprovalModal('${r.id}')" style="font-size: 0.82rem; padding: 7px 16px;">
                    👑 Approve & Grant Access
                  </button>
                  <button class="btn-pill" style="font-size: 0.82rem; padding: 7px 14px; background: rgba(239, 68, 68, 0.12); color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.3);" onclick="window.handleDenyRental('${r.id}')">
                    ⛔ Reject Request
                  </button>
                ` : ''}

                ${isActive ? `
                  <button class="btn-pill btn-pill-subtle" onclick="window.handleExtendRentalPrompt('${r.id}')" style="font-size: 0.80rem; padding: 6px 12px;">
                    ⏱️ Extend Expiry
                  </button>
                  <button class="btn-pill" style="font-size: 0.80rem; padding: 6px 12px; background: rgba(239, 68, 68, 0.12); color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.3);" onclick="window.handleSuspendRental('${r.id}')">
                    ⛔ Deny Access / Revoke License
                  </button>
                  <button class="btn-pill btn-pill-subtle" onclick="window.handleOwnerInspectEvent('${r.eventKey}')" style="font-size: 0.80rem; padding: 6px 12px;">
                    👁️ Inspect Event Admin
                  </button>
                ` : ''}

                ${!isPending && !isActive ? `
                  <button class="btn-pill btn-pill-subtle" onclick="window.openRentalApprovalModal('${r.id}')" style="font-size: 0.80rem; padding: 6px 12px;">
                    🔄 Reactivate License
                  </button>
                ` : ''}
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // 3. Render Running Events List (Streamlined: Access Management & Grand Purge only)
    const fleetEl = document.getElementById('owner-active-events-list');
    if (fleetEl) {
      if (allRunningKeys.length === 0) {
        fleetEl.innerHTML = `<div style="text-align: center; padding: 36px 20px; color: var(--text-muted); font-size: 0.95rem;">
          <div style="font-size: 2rem; margin-bottom: 8px;">🎪</div>
          <strong>No active events currently hosted</strong>
          <div style="font-size: 0.82rem; margin-top: 4px;">Approved events will automatically appear here once hosted.</div>
        </div>`;
      } else {
        fleetEl.innerHTML = allRunningKeys.map(key => {
          const ev = (data.events && data.events[key]) || {};
          const rental = rentals.find(r => (r.eventKey || '').toUpperCase().trim() === key.toUpperCase());
          const eventName = ev.name || (rental ? rental.eventName : key);
          const bookTitle = ev.bookTitle || (rental ? rental.bookTitle : 'Commemorative Book');
          const unitPrice = ev.unitPrice || (rental ? rental.unitPrice : 100);
          const hostEmail = (rental && rental.hostEmail) || 'safwanvgd313@gmail.com';
          const countersCount = (ev.counters && ev.counters.length) || (rental && rental.allowedCounters) || 1;
          const status = rental ? rental.status : 'ACTIVE';
          const isExpired = rental && rental.expiresAt && new Date() > new Date(rental.expiresAt);
          const createdDate = ev.createdAt ? new Date(ev.createdAt).toLocaleDateString() : (rental && rental.requestedAt ? new Date(rental.requestedAt).toLocaleDateString() : 'Active');
          const expiryDate = rental && rental.expiresAt ? new Date(rental.expiresAt).toLocaleDateString() : 'Permanent';

          return `
            <div class="rental-item-card">
              <div class="rental-card-header">
                <div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: 800; font-size: 1.05rem;">${eventName}</span>
                    <span class="font-mono" style="background: rgba(0,102,255,0.12); color: #0066FF; font-weight: 800; padding: 2px 8px; border-radius: 6px; font-size: 0.80rem;">${key}</span>
                  </div>
                  <div style="font-size: 0.80rem; color: var(--text-secondary); margin-top: 3px;">
                    Book: <strong>${bookTitle}</strong> (₹${unitPrice}) • Host: <a href="mailto:${hostEmail}" style="color: #0066FF; text-decoration: none;">${hostEmail}</a>
                  </div>
                </div>
                <span class="rental-badge ${isExpired ? 'expired' : (status === 'ACTIVE' ? 'active' : 'denied')}">
                  ${isExpired ? 'EXPIRED' : status}
                </span>
              </div>

              <div class="rental-meta-grid">
                <div class="rental-meta-cell">
                  <span class="rental-meta-title">Live Counters</span>
                  <span class="rental-meta-val">${countersCount} Desks Active</span>
                </div>
                <div class="rental-meta-cell">
                  <span class="rental-meta-title">License Expiry</span>
                  <span class="rental-meta-val">${expiryDate}</span>
                </div>
                <div class="rental-meta-cell">
                  <span class="rental-meta-title">Assigned Host</span>
                  <span class="rental-meta-val">${hostEmail}</span>
                </div>
                <div class="rental-meta-cell">
                  <span class="rental-meta-title">Created Date</span>
                  <span class="rental-meta-val">${createdDate}</span>
                </div>
              </div>

              <div class="rental-actions-row">
                <button class="btn-pill btn-pill-subtle" onclick="window.handleOwnerInspectEvent('${key}')" style="font-size: 0.80rem; padding: 6px 12px;">
                  👁️ Inspect Admin View
                </button>
                ${rental ? `
                  <button class="btn-pill btn-pill-subtle" onclick="window.handleExtendRentalPrompt('${rental.id}')" style="font-size: 0.80rem; padding: 6px 12px;">
                    ⏱️ Extend Expiry
                  </button>
                  <button class="btn-pill" style="font-size: 0.80rem; padding: 6px 12px; background: rgba(239, 68, 68, 0.12); color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.3);" onclick="window.handleSuspendRental('${rental.id}')">
                    ⛔ Deny Access / Revoke
                  </button>
                ` : ''}
                <button class="btn-pill btn-purge-danger" onclick="window.handleOwnerPurgeEvent('${key}', '${eventName.replace(/'/g, "\\'")}')">
                  🗑️ Delete Event & Purge Data
                </button>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  // Grand Delete / Hard Purge Handler (Requirement 5)
  window.handleOwnerPurgeEvent = async function(eventKey, eventName) {
    const isSpecial = eventKey === 'CS2026' || (eventName && eventName.toLowerCase().includes('almuneer'));
    const promptMsg = isSpecial 
      ? `⚠️ GRAND PURGE WARNING: You are about to permanently purge test event "${eventName}" (${eventKey}).\n\nThis will completely delete all counter registers, transactions, sales, and platform rentals from localStorage, IndexedDB, and the cloud Firestore database.\n\nType DELETE to confirm:`
      : `⚠️ GRAND PURGE: Are you sure you want to completely remove "${eventName}" (${eventKey}) and purge all counter records and transactions from the server database?\n\nThis cannot be undone. Type DELETE to confirm:`;

    const conf = prompt(promptMsg);
    if (conf !== 'DELETE') {
      showToast('Purge cancelled. Data unchanged.', 'info');
      return;
    }

    try {
      showToast(`Purging event ${eventKey}...`, 'info');
      await CS_Store.purgeEvent(eventKey);
      if (typeof CS_Audio !== 'undefined' && CS_Audio.alertWarning) CS_Audio.alertWarning();
      showToast(`Event "${eventName}" (${eventKey}) was permanently purged from all databases.`, 'success');
      renderOwnerPortal();
    } catch (err) {
      showToast(`Failed to purge: ${err.message}`, 'error');
    }
  };

  window.openRentalApprovalModal = function(rentalId) {
    const rentals = CS_Store.getPlatformRentals();
    const rental = rentals.find(r => r.id === rentalId);
    if (!rental) return;

    const elId = document.getElementById('approve-rental-id');
    const elName = document.getElementById('approve-host-name-display');
    const elEmail = document.getElementById('approve-host-email-display');
    const elKey = document.getElementById('approve-event-key');
    const elCounters = document.getElementById('approve-allowed-counters');
    const elExpires = document.getElementById('approve-expires-at');
    const elNotes = document.getElementById('approve-notes');

    if (elId) elId.value = rental.id;
    if (elName) elName.textContent = rental.hostName || 'Host';
    if (elEmail) elEmail.textContent = rental.hostEmail || '';
    if (elKey) elKey.value = rental.eventKey || 'CS' + Math.floor(1000 + Math.random() * 9000);
    if (elCounters) elCounters.value = String(rental.allowedCounters || 3);
    
    const defaultExpiry = rental.expiresAt ? rental.expiresAt.split('T')[0] : new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    if (elExpires) elExpires.value = defaultExpiry;
    if (elNotes) elNotes.value = rental.notes || 'Approved festival license';

    const modal = document.getElementById('modal-rental-approval');
    if (modal) modal.classList.remove('hidden');
  };

  window.setApprovalPresetDays = function(days) {
    const targetDate = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
    const el = document.getElementById('approve-expires-at');
    if (el) el.value = targetDate;
  };

  window.handleDenyRental = function(rentalId) {
    const reason = prompt('Enter reason for declining this rental request (e.g. Dates unavailable, quota full):', 'Rental request declined by platform administrator');
    if (reason === null) return;
    CS_Store.denyRental(rentalId, reason);
    if (typeof CS_Audio !== 'undefined' && CS_Audio.alertWarning) CS_Audio.alertWarning();
    showToast('Rental request rejected.', 'info');
    renderOwnerPortal();
  };

  window.handleSuspendRental = function(rentalId) {
    if (confirm('Deny / Revoke access for this host? Once revoked, the host and all counter terminals for this event will be immediately locked out.')) {
      CS_Store.suspendRental(rentalId, 'Access revoked by platform owner (safwanvgd313@gmail.com)');
      if (typeof CS_Audio !== 'undefined' && CS_Audio.alertWarning) CS_Audio.alertWarning();
      showToast('Rental license revoked. Access denied.', 'info');
      renderOwnerPortal();
    }
  };

  window.handleExtendRentalPrompt = function(rentalId) {
    const rentals = CS_Store.getPlatformRentals();
    const rental = rentals.find(r => r.id === rentalId);
    if (!rental) return;

    const currentExpiry = rental.expiresAt ? rental.expiresAt.split('T')[0] : new Date().toISOString().split('T')[0];
    const newExpiry = prompt(`Extend rental expiration date for "${rental.eventName}" (YYYY-MM-DD):`, currentExpiry);
    if (!newExpiry) return;

    const isoDate = new Date(newExpiry + 'T23:59:59.000Z').toISOString();
    CS_Store.extendRental(rentalId, isoDate);
    if (typeof CS_Audio !== 'undefined' && CS_Audio.handshakeSuccess) CS_Audio.handshakeSuccess();
    showToast(`Rental extended until ${new Date(isoDate).toLocaleDateString()}!`, 'success');
    renderOwnerPortal();
  };

  window.handleOwnerInspectEvent = function(eventKey) {
    state.eventKey = eventKey;
    state.role = 'ADMIN';
    showToast(`Switching to ${eventKey} Super Admin Console...`, 'info');
    navigateTo('admin');
  };

  function initOwnerPortal() {
    // Owner tab navigation
    document.querySelectorAll('.owner-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.owner-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.ownerTab;
        const subSections = document.querySelectorAll('.owner-sub-section');
        subSections.forEach(s => s.classList.add('hidden'));

        if (tab === 'inbox') {
          const s = document.getElementById('owner-section-inbox');
          if (s) s.classList.remove('hidden');
        } else if (tab === 'events') {
          const s = document.getElementById('owner-section-events');
          if (s) s.classList.remove('hidden');
        } else if (tab === 'grant') {
          const s = document.getElementById('owner-section-grant');
          if (s) s.classList.remove('hidden');
        }
      });
    });

    // Form: confirm rental approval modal
    const formApprove = document.getElementById('form-confirm-rental-approval');
    if (formApprove) {
      formApprove.addEventListener('submit', (e) => {
        e.preventDefault();
        const rentalId = document.getElementById('approve-rental-id').value;
        const eventKey = document.getElementById('approve-event-key').value.trim().toUpperCase();
        const allowedCounters = document.getElementById('approve-allowed-counters').value;
        const expiresAtDate = document.getElementById('approve-expires-at').value;
        const notes = document.getElementById('approve-notes').value.trim();

        const expiresAt = new Date(expiresAtDate + 'T23:59:59.000Z').toISOString();

        CS_Store.approveRental(rentalId, {
          eventKey,
          allowedCounters,
          expiresAt,
          notes
        });

        const modal = document.getElementById('modal-rental-approval');
        if (modal) modal.classList.add('hidden');

        if (typeof CS_Audio !== 'undefined' && CS_Audio.handshakeSuccess) CS_Audio.handshakeSuccess();
        showToast(`Rental License Approved for ${eventKey}! Access Granted.`, 'success');
        renderOwnerPortal();
      });
    }

    // Form: direct manual grant
    const formGrant = document.getElementById('form-owner-direct-grant');
    if (formGrant) {
      formGrant.addEventListener('submit', (e) => {
        e.preventDefault();
        const hostEmail = document.getElementById('grant-host-email').value.trim();
        const hostName = document.getElementById('grant-host-name').value.trim();
        const organization = document.getElementById('grant-host-org').value.trim();
        const eventName = document.getElementById('grant-event-name').value.trim();
        const eventKey = document.getElementById('grant-event-key').value.trim().toUpperCase();
        const allowedCounters = document.getElementById('grant-allowed-counters').value;
        const expiresAtDate = document.getElementById('grant-expires-at').value;

        const expiresAt = new Date(expiresAtDate + 'T23:59:59.000Z').toISOString();

        const req = CS_Store.createRentalRequest({
          hostEmail,
          hostName,
          organization,
          eventName,
          eventKey,
          allowedCounters,
          expiresAt
        });

        CS_Store.approveRental(req.id, {
          eventKey,
          allowedCounters,
          expiresAt
        });

        formGrant.reset();
        if (typeof CS_Audio !== 'undefined' && CS_Audio.handshakeSuccess) CS_Audio.handshakeSuccess();
        showToast(`Direct Rental License Issued to ${hostEmail}!`, 'success');
        
        const tabEvents = document.getElementById('tab-btn-owner-events');
        if (tabEvents) tabEvents.click();
        renderOwnerPortal();
      });
    }

    // Screen Lock Timer & Owner Security PIN Settings (Requirement 7)
    const pinInput = document.getElementById('owner-security-pin-input');
    const btnSavePin = document.getElementById('btn-save-owner-pin');
    const timerSelect = document.getElementById('select-owner-lock-timer');
    const btnManualLock = document.getElementById('btn-owner-manual-lock');

    if (pinInput && CS_Store.getOwnerPin) {
      pinInput.value = CS_Store.getOwnerPin();
    }
    if (timerSelect && CS_Store.getOwnerLockTimer) {
      timerSelect.value = String(CS_Store.getOwnerLockTimer());
    }

    if (btnSavePin) {
      btnSavePin.addEventListener('click', () => {
        const pin = (pinInput ? pinInput.value : '').trim();
        if (!/^\d{4,8}$/.test(pin)) {
          showToast('Owner Security PIN must be between 4 and 8 digits.', 'error');
          if (pinInput) pinInput.focus();
          return;
        }
        CS_Store.setOwnerPin(pin);
        if (typeof CS_Audio !== 'undefined' && CS_Audio.handshakeSuccess) CS_Audio.handshakeSuccess();
        showToast(`Owner Console Security PIN saved: ${pin}`, 'success');
      });
    }

    if (timerSelect) {
      timerSelect.addEventListener('change', () => {
        const sec = parseInt(timerSelect.value, 10) || 0;
        CS_Store.setOwnerLockTimer(sec);
        if (typeof showToast === 'function') {
          showToast(sec === 0 ? 'Owner Console auto-lock disabled.' : `Auto-lock timer set to ${sec / 60} min.`, 'info');
        }
        resetIdleActivity();
      });
    }

    if (btnManualLock) {
      btnManualLock.addEventListener('click', () => {
        lockWorkspace();
      });
    }

    // Owner hero action buttons
    const btnManualGrant = document.getElementById('btn-owner-manual-grant');
    if (btnManualGrant) {
      btnManualGrant.addEventListener('click', () => {
        const tabGrant = document.getElementById('tab-btn-owner-grant');
        if (tabGrant) tabGrant.click();
      });
    }

    const btnSwitchCS2026 = document.getElementById('btn-owner-switch-cs2026');
    if (btnSwitchCS2026) {
      btnSwitchCS2026.addEventListener('click', () => {
        state.eventKey = 'CS2026';
        state.role = 'ADMIN';
        navigateTo('admin');
      });
    }

    const btnOwnerExit = document.getElementById('btn-owner-exit');
    if (btnOwnerExit) {
      btnOwnerExit.addEventListener('click', () => {
        if (confirm('Exit Platform Owner Console and return to Brand Gateway?')) {
          CS_Store.clearSession();
          state.role = null;
          state.currentUser = null;
          navigateTo('landing');
        }
      });
    }
  }

  // --- 6. Event Host Rental Application & Status Views ---
  function initHostViews() {
    const formReq = document.getElementById('form-host-rental-application');
    if (formReq) {
      formReq.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = state.currentUser || {};
        const organization = document.getElementById('req-org-name').value.trim();
        const phone = document.getElementById('req-phone').value.trim();
        const eventName = document.getElementById('req-event-name').value.trim();
        const eventKey = document.getElementById('req-event-key').value.trim().toUpperCase();
        const startsAtDate = document.getElementById('req-start-date').value;
        const endDateDate = document.getElementById('req-end-date').value;
        const allowedCounters = document.getElementById('req-counter-count').value;
        const bookTitle = document.getElementById('req-book-title').value.trim();
        const unitPrice = document.getElementById('req-unit-price').value;
        const notes = document.getElementById('req-notes').value.trim();

        const startsAt = startsAtDate ? new Date(startsAtDate + 'T00:00:00.000Z').toISOString() : new Date().toISOString();
        const expiresAt = endDateDate ? new Date(endDateDate + 'T23:59:59.000Z').toISOString() : new Date(Date.now() + 7 * 86400000).toISOString();

        const rental = CS_Store.createRentalRequest({
          hostEmail: user.email || 'host@festival.org',
          hostName: user.displayName || 'Event Host',
          organization,
          phone,
          eventName,
          eventKey,
          startsAt,
          expiresAt,
          allowedCounters,
          bookTitle,
          unitPrice,
          notes
        });

        state.currentRental = rental;
        if (typeof CS_Audio !== 'undefined' && CS_Audio.handshakeSuccess) CS_Audio.handshakeSuccess();
        showToast('Rental application submitted! Awaiting review from safwanvgd313@gmail.com', 'success');
        navigateTo('rental-status');
      });
    }

    const btnCancelHostReq = document.getElementById('btn-cancel-host-request');
    if (btnCancelHostReq) {
      btnCancelHostReq.addEventListener('click', () => {
        navigateTo('landing');
      });
    }

    const btnRefreshStatus = document.getElementById('btn-refresh-rental-status');
    if (btnRefreshStatus) {
      btnRefreshStatus.addEventListener('click', () => {
        const user = state.currentUser || (CS_Store.getSession() ? CS_Store.getSession().user : null);
        if (!user || !user.email) {
          navigateTo('landing');
          return;
        }
        showToast('Checking latest approval status...', 'info');
        const rental = CS_Store.getRentalByEmail(user.email);
        if (rental) {
          state.currentRental = rental;
          if (rental.status === 'ACTIVE' && (!rental.expiresAt || new Date() <= new Date(rental.expiresAt))) {
            showToast('Congratulations! Your rental license has been approved by Safwan.', 'success');
            state.role = 'ADMIN';
            state.eventKey = rental.eventKey;
            CS_Store.setSession({ role: 'ADMIN', eventKey: rental.eventKey, user });
            CS_Store.initCloudSync(rental.eventKey);
            if (typeof CS_Audio !== 'undefined' && CS_Audio.handshakeSuccess) CS_Audio.handshakeSuccess();
            navigateTo('admin');
            return;
          }
        }
        renderRentalStatusView();
      });
    }

    const btnExitRentalStatus = document.getElementById('btn-exit-rental-status');
    if (btnExitRentalStatus) {
      btnExitRentalStatus.addEventListener('click', () => {
        CS_Store.clearSession();
        state.role = null;
        state.currentUser = null;
        navigateTo('landing');
      });
    }
  }

  function renderHostRequestView() {
    const user = state.currentUser || {};
    const avatarEl = document.getElementById('host-user-avatar');
    const nameEl = document.getElementById('host-user-name');
    const emailEl = document.getElementById('host-user-email');

    if (avatarEl) {
      const initial = (user.displayName || user.email || 'H').charAt(0).toUpperCase();
      avatarEl.textContent = initial;
    }
    if (nameEl) nameEl.textContent = user.displayName || 'Event Organizer';
    if (emailEl) emailEl.textContent = user.email || 'organizer@litfest.org';

    const today = new Date();
    const tomorrow = new Date(today.getTime() + 86400000).toISOString().split('T')[0];
    const nextWeek = new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0];

    const startInput = document.getElementById('req-start-date');
    const endInput = document.getElementById('req-end-date');
    if (startInput && !startInput.value) startInput.value = tomorrow;
    if (endInput && !endInput.value) endInput.value = nextWeek;
  }

  function renderRentalStatusView() {
    const rental = state.currentRental;
    if (!rental) {
      navigateTo('landing');
      return;
    }

    const iconEl = document.getElementById('status-card-icon');
    const titleEl = document.getElementById('status-card-title');
    const descEl = document.getElementById('status-card-desc');
    const detailsEl = document.getElementById('status-card-details');

    const isExpired = rental.expiresAt && new Date() > new Date(rental.expiresAt);

    if (rental.status === 'PENDING') {
      if (iconEl) {
        iconEl.className = 'status-hero-icon pending';
        iconEl.textContent = '⏳';
      }
      if (titleEl) titleEl.textContent = 'Application Under Review';
      if (descEl) descEl.textContent = `Your rental application for "${rental.eventName}" (${rental.eventKey}) has been submitted to Safwan (Platform Owner). You will be granted access as soon as your rental license is reviewed.`;
    } else if (rental.status === 'ACTIVE' && isExpired) {
      if (iconEl) {
        iconEl.className = 'status-hero-icon expired';
        iconEl.textContent = '🔴';
      }
      if (titleEl) titleEl.textContent = 'Rental License Concluded';
      if (descEl) descEl.textContent = `The rental period for event "${rental.eventName}" (${rental.eventKey}) ended on ${new Date(rental.expiresAt).toLocaleDateString()}. Counter desks and admin consoles are currently locked. Contact Safwan to renew or extend.`;
    } else if (rental.status === 'DENIED' || rental.status === 'SUSPENDED') {
      if (iconEl) {
        iconEl.className = 'status-hero-icon denied';
        iconEl.textContent = '⛔';
      }
      if (titleEl) titleEl.textContent = rental.status === 'SUSPENDED' ? 'Access Suspended' : 'Application Not Approved';
      if (descEl) descEl.textContent = rental.deniedReason || rental.suspendedReason || 'Access has been suspended by the platform administrator (safwanvgd313@gmail.com).';
    }

    if (detailsEl) {
      detailsEl.innerHTML = `
        <div class="rental-meta-cell">
          <span class="rental-meta-title">Event Name</span>
          <span class="rental-meta-val">${rental.eventName || 'Event'}</span>
        </div>
        <div class="rental-meta-cell">
          <span class="rental-meta-title">Access Key</span>
          <span class="rental-meta-val font-mono" style="color: #0066FF;">${rental.eventKey || 'TBD'}</span>
        </div>
        <div class="rental-meta-cell">
          <span class="rental-meta-title">Rental Validity</span>
          <span class="rental-meta-val">${rental.expiresAt ? new Date(rental.expiresAt).toLocaleDateString() : 'Pending Approval'}</span>
        </div>
        <div class="rental-meta-cell">
          <span class="rental-meta-title">Counter Desks</span>
          <span class="rental-meta-val">${rental.allowedCounters || 3} Desks</span>
        </div>
      `;
    }
  }

  // Check URL hash for direct Platform Owner access
  function checkUrlHashOwner() {
    if (window.location.hash === '#owner') {
      const session = CS_Store.getSession();
      const user = state.currentUser || (session ? session.user : null);
      if (user && CS_Store.isPlatformOwner(user.email)) {
        navigateTo('owner-portal');
      } else {
        handleHostEventClick();
      }
    }
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
    } else if (eventType === 'RENTALS_SYNC' || eventType === 'EVENTS_ALL_SYNC') {
      if (state.currentView === 'owner-portal') renderOwnerPortal();
      if (state.currentView === 'rental-status') {
        const user = state.currentUser || (CS_Store.getSession() ? CS_Store.getSession().user : null);
        if (user && user.email) {
          const updatedRental = CS_Store.getRentalByEmail(user.email);
          if (updatedRental && updatedRental.status === 'ACTIVE' && (!updatedRental.expiresAt || new Date() <= new Date(updatedRental.expiresAt))) {
            showToast('Congratulations! Your rental application was approved by the platform owner.', 'success');
            state.role = 'ADMIN';
            state.eventKey = updatedRental.eventKey;
            CS_Store.setSession({ role: 'ADMIN', eventKey: updatedRental.eventKey, user });
            CS_Store.initCloudSync(updatedRental.eventKey);
            navigateTo('admin');
            return;
          }
        }
        renderRentalStatusView();
      }
    }

    if (state.currentView === 'pos') {
      renderPOSWorkspace();
    } else if (state.currentView === 'stockroom') {
      renderStockRoomWorkspace();
    } else if (state.currentView === 'admin') {
      renderAdminDashboard();
    } else if (state.currentView === 'owner-portal') {
      renderOwnerPortal();
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

  // --- Firebase Google Auth & Redirect Result Listener ---
  async function initFirebaseAuthListener() {
    if (typeof window === 'undefined' || !window.CS_Firebase) return false;

    // Check if returning from Google redirect
    const wasRedirecting = sessionStorage.getItem('cs_auth_redirect_in_progress') === 'true' ||
                           localStorage.getItem('cs_auth_redirect_in_progress') === 'true';
    if (wasRedirecting) {
      sessionStorage.removeItem('cs_auth_redirect_in_progress');
      localStorage.removeItem('cs_auth_redirect_in_progress');
      if (typeof showToast === 'function') {
        showToast('Completing Google authentication...', 'info');
      }
    }

    // 1. Process Google Sign-In redirect result
    try {
      if (typeof window.CS_Firebase.getRedirectResult === 'function') {
        const redirectUser = await window.CS_Firebase.getRedirectResult();
        if (redirectUser) {
          if (typeof showToast === 'function') {
            showToast(`Signed in as ${redirectUser.displayName || redirectUser.email}`, 'success');
          }
          await handleAuthenticatedUser(redirectUser);
          return true;
        }
      }
    } catch (err) {
      console.warn("[CounterSync Auth] Redirect auth error:", err);
      if (err.message && typeof showToast === 'function') {
        showToast(err.message, 'error', 9000);
      }
    }

    // 2. Wait for initial Firebase Auth state resolution (from IndexedDB / cache)
    return new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }, wasRedirecting ? 2500 : 600);

      if (typeof window.CS_Firebase.onAuthStateChanged === 'function') {
        window.CS_Firebase.onAuthStateChanged(async (firebaseUser) => {
          if (firebaseUser) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              await handleAuthenticatedUser(firebaseUser);
              resolve(true);
            } else {
              await handleAuthenticatedUser(firebaseUser);
            }
          } else {
            if (!resolved && !wasRedirecting) {
              resolved = true;
              clearTimeout(timeout);
              resolve(false);
            }
          }
        });
      } else {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  }

  // --- App Initialization Bootstrapper ---
  async function init() {
    try {
      cacheDOMElements();
      initTheme();
      initGateway();
      initPOSWorkspace();
      initStockRoomWorkspace();
      initAdminDashboard();
      initOwnerPortal();
      initHostViews();
      initModals();
      registerServiceWorker();

      // Triple tap logo on landing for direct owner login
      let logoClicks = 0;
      let logoTimer = null;
      const landingLogo = document.querySelector('.landing-logo');
      if (landingLogo) {
        landingLogo.style.cursor = 'pointer';
        landingLogo.addEventListener('click', () => {
          logoClicks++;
          clearTimeout(logoTimer);
          logoTimer = setTimeout(() => { logoClicks = 0; }, 1500);
          if (logoClicks >= 3) {
            logoClicks = 0;
            handleHostEventClick();
          }
        });
      }

      window.addEventListener('hashchange', checkUrlHashOwner);

      // Check if there was an active session (Requirement 6: Persistent Session / One-Time Login)
      const session = CS_Store.getSession();
      let hasResumedSession = false;
      if (session && session.role && session.eventKey) {
        state.eventKey = session.eventKey;
        state.role = session.role;
        state.currentUser = session.user || null;
        state.counterId = session.counterId || null;
        CS_Store.initCloudSync(session.eventKey);

        if (session.role === 'OWNER' && CS_Store.isPlatformOwner(session.user && session.user.email)) {
          navigateTo('owner-portal');
          hasResumedSession = true;
        } else if (session.role === 'POS' && state.counterId) {
          navigateTo('pos');
          hasResumedSession = true;
        } else if (session.role === 'STOCKROOM') {
          navigateTo('stockroom');
          hasResumedSession = true;
        } else if (session.role === 'ADMIN') {
          navigateTo('admin');
          hasResumedSession = true;
        }
      }

      if (!hasResumedSession) {
        navigateTo('landing');
      } else {
        // Auto-lock feature: app automatically locks if it was closed, staff enters dashboard by unlocking with PIN
        const isAppReopened = !sessionStorage.getItem('countersync_session_unlocked') || localStorage.getItem('countersync_app_closed_lock') === 'true';
        if (isAppReopened && isLiveHostedWorkspace()) {
          lockWorkspace(true);
        } else {
          try { sessionStorage.setItem('countersync_session_unlocked', 'true'); } catch (e) {}
        }
      }

      // Automatically register app close / tab close for security auto-lock on next launch
      window.addEventListener('pagehide', () => {
        try { localStorage.setItem('countersync_app_closed_lock', 'true'); } catch (e) {}
      });
      window.addEventListener('beforeunload', () => {
        try { localStorage.setItem('countersync_app_closed_lock', 'true'); } catch (e) {}
      });

      // Check URL hash (#owner)
      checkUrlHashOwner();

      // Hook Firebase authentication redirect & state listeners in background
      initFirebaseAuthListener().catch(err => console.warn("[CounterSync Auth] Init listener error:", err));
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
