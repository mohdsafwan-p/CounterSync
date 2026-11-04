/**
 * CounterSync Default Seed Generator
 * Pre-populates realistic data for the default event: CS2026
 */

const CS_DEFAULT_SEED = {
  activeEventKey: "CS2026",
  events: {
    "CS2026": {
      key: "CS2026",
      name: "Almuneer 2026",
      tagline: "Smart Counters. Seamless Sales.",
      bookTitle: "Chronicles of Almuneer (Festival Commemorative Edition)",
      unitPrice: 100,
      adminPin: "9999",
      stockRoomPin: "5555",
      createdAt: "2026-10-30T09:00:00.000Z",
      
      // Central Stock Vault
      stockRoom: {
        totalPressInflow: 2500,
        vaultReserve: 2005,
        keeperName: "Vikram Malhotra & Logistics Squad",
        corrections: [
          {
            id: "COR-101",
            timestamp: "2026-10-31T08:30:00.000Z",
            change: -20,
            reason: "Damaged Bundles",
            notes: "20 copies water damaged during monsoon road transit from press",
            loggedBy: "Vikram M."
          }
        ],
        vaultGiveaways: [
          {
            id: "VG-201",
            timestamp: "2026-11-01T10:00:00.000Z",
            recipientName: "Dr. K. Radhakrishnan (Chief Guest)",
            designation: "Keynote Speaker & Former ISRO Chairman",
            copies: 5,
            notes: "Issued directly from main warehouse vault for dignitary felicitations",
            issuedBy: "Organizer HQ"
          }
        ]
      },

      // Counters
      counters: [
        {
          id: "counter-01a",
          name: "Counter 01A",
          pin: "1101",
          volunteers: "Safwan, Rashid",
          upiId: "cs.counter01a@okhdfcbank",
          upiName: "CounterSync 01A",
          initialStock: 100,
          currentStock: 89,
          notes: "Primary rush hour desk next to Food Court",
          lowStockAlert: false
        },
        {
          id: "counter-01b",
          name: "Counter 01B",
          pin: "1102",
          volunteers: "Sneha Rao & Amit Patel",
          upiId: "cs.counter01b@icici",
          upiName: "CounterSync 01B",
          initialStock: 150,
          currentStock: 127,
          notes: "Secondary rush desk near book signing tent",
          lowStockAlert: false
        },
        {
          id: "counter-02a",
          name: "Counter 02A (Auditorium Foyer)",
          pin: "1201",
          volunteers: "Rohan Varma & Ananya Iyer",
          upiId: "cs.counter02a@oksbi",
          upiName: "CounterSync 02A",
          initialStock: 40,
          currentStock: 9, // <= 10 to demonstrate bold red warning & low stock alert!
          notes: "Auditorium side counter - running very low",
          lowStockAlert: true,
          lowStockTimestamp: "2026-11-02T00:15:00.000Z"
        },
        {
          id: "counter-02b",
          name: "Counter 02B (VIP Pavilion Gate)",
          pin: "1202",
          volunteers: "Karthik Menon & Divya Sen",
          upiId: "cs.counter02b@axisbank",
          upiName: "CounterSync 02B",
          initialStock: 100,
          currentStock: 95,
          notes: "VIP reception entrance counter",
          lowStockAlert: false
        }
      ],

      // In-transit dispatches between stockroom and counters
      dispatches: [
        {
          id: "DSP-301",
          counterId: "counter-01a",
          counterName: "Counter 01A (Main Lawn North)",
          copies: 50,
          timestamp: "2026-11-01T23:50:00.000Z",
          status: "IN_TRANSIT", // Pending acceptance handshake
          dispatchedBy: "Vikram (Central Stock Room)"
        },
        {
          id: "DSP-300",
          counterId: "counter-02a",
          counterName: "Counter 02A (Auditorium Foyer)",
          copies: 30,
          timestamp: "2026-11-01T14:30:00.000Z",
          status: "ACCEPTED",
          acceptedAt: "2026-11-01T14:45:00.000Z",
          acceptedBy: "Rohan Varma"
        }
      ],

      // Inter-counter transfers (Books & Cash) with Two-Way Handshake
      transfers: [
        {
          id: "TRF-401",
          transfer_id: "trf_99201bc",
          type: "BOOKS",
          fromCounterId: "counter-01b",
          from_counter: "counter-01b",
          fromCounterName: "Counter 01B (Main Lawn South)",
          toCounterId: "counter-02a",
          to_counter: "counter-02a",
          toCounterName: "Counter 02A (Auditorium Foyer)",
          copies: 15,
          amount_or_quantity: 15,
          cashAmount: 0,
          notes: "Sudden rush at stage entrance after keynote session",
          status: "ACCEPTED",
          authorizedBy: "Amit Patel (PIN: 1102)",
          initiated_at: "2026-11-01T16:20:00.000Z",
          resolved_at: "2026-11-01T16:22:00.000Z",
          resolved_by: "Rohan Varma"
        },
        {
          id: "TRF-402",
          transfer_id: "trf_88102cd",
          type: "CASH",
          fromCounterId: "counter-01b",
          from_counter: "counter-01b",
          fromCounterName: "Counter 01B (Main Lawn South)",
          toCounterId: "counter-01a",
          to_counter: "counter-01a",
          toCounterName: "Counter 01A",
          copies: 0,
          amount_or_quantity: 500,
          cashAmount: 500,
          notes: "Float change for ₹500 bill",
          status: "PENDING",
          authorizedBy: "Amit Patel (PIN: 1102)",
          initiated_at: "2026-11-02T11:45:00.000Z",
          resolved_at: null,
          resolved_by: null
        }
      ],

      // Micro-donations & excess payment handling
      donations: [
        {
          donation_id: "don_88291f0a",
          counter_id: "counter-01a",
          counter_name: "Counter 01A",
          timestamp: "2026-11-01T14:23:10Z",
          amount: 200,
          donor_name: "Anonymous Patron",
          donor_phone: "9847012345",
          payment_mode: "CASH",
          linked_sale_id: "TXN-2001",
          notes: "Customer waived ₹200 balance change as festival library donation"
        },
        {
          donation_id: "don_77192a0b",
          counter_id: "counter-01b",
          counter_name: "Counter 01B",
          timestamp: "2026-11-02T10:15:00Z",
          amount: 500,
          donor_name: "K. M. Basheer",
          donor_phone: "9447123987",
          payment_mode: "UPI",
          linked_sale_id: null,
          notes: "Direct discretionary donation for student publication fund"
        }
      ],

      // Pre-order system
      preOrders: [
        {
          token: "ALM-26-0101",
          buyerName: "Rashid P.K",
          phone: "9847012345",
          copies: 2,
          totalAmount: 200,
          paymentType: "PAID", // Already Paid online
          status: "PENDING",
          fulfilledAt: null,
          fulfilledByCounter: null,
          notes: "Festival VIP Pre-Order"
        },
        {
          token: "ALM-26-0102",
          buyerName: "Zainul Abid Master",
          phone: "9446123456",
          copies: 1,
          totalAmount: 100,
          paymentType: "PAID", // Already Paid online
          status: "PENDING",
          fulfilledAt: null,
          fulfilledByCounter: null,
          notes: "Keynote Author Pass"
        },
        {
          token: "ALM-26-0103",
          buyerName: "Muhammed Nihal",
          phone: "9995876543",
          copies: 1,
          totalAmount: 100,
          paymentType: "PAY_ON_PICKUP", // Collect at counter
          status: "PENDING",
          fulfilledAt: null,
          fulfilledByCounter: null,
          notes: "Pay on counter pickup"
        }
      ],

      // Shift cash reconciliations logged by counters
      reconciliations: [
        {
          id: "REC-501",
          counterId: "counter-01a",
          counterName: "Counter 01A (Main Lawn North)",
          timestamp: "2026-11-01T21:30:00.000Z",
          closedBy: "Rahul Sharma",
          expectedCash: 600,
          countedCash: 600,
          difference: 0,
          status: "EXACT",
          denominations: { 500: 1, 200: 0, 100: 1, 50: 0, 20: 0, 10: 0 }
        }
      ],

      // Master transactions ledger across days (Consistent Unit Price: ₹100)
      transactions: [
        // Historical Day 1: 2026-10-31
        {
          id: "TXN-1001",
          timestamp: "2026-10-31T10:15:00.000Z",
          counterId: "counter-01a",
          counterName: "Counter 01A (Main Lawn North)",
          copies: 2,
          unitPrice: 100,
          totalAmount: 200,
          paymentMode: "CASH",
          buyerName: "Sunil Gavaskar Fan Club",
          buyerPhone: "9845011111",
          type: "SALE",
          voided: false
        },
        {
          id: "TXN-1002",
          timestamp: "2026-10-31T11:45:00.000Z",
          counterId: "counter-01a",
          counterName: "Counter 01A (Main Lawn North)",
          copies: 1,
          unitPrice: 100,
          totalAmount: 100,
          paymentMode: "UPI",
          buyerName: "Kavita Krishnan",
          buyerPhone: "9845022222",
          type: "SALE",
          voided: false
        },
        {
          id: "TXN-1003",
          timestamp: "2026-10-31T14:20:00.000Z",
          counterId: "counter-01b",
          counterName: "Counter 01B (Main Lawn South)",
          copies: 5,
          unitPrice: 100,
          totalAmount: 500,
          paymentMode: "UPI",
          buyerName: "Infosys Literary Circle",
          buyerPhone: "9845033333",
          type: "SALE",
          voided: false
        },
        {
          id: "TXN-1004",
          timestamp: "2026-10-31T16:00:00.000Z",
          counterId: "counter-02b",
          counterName: "Counter 02B (VIP Pavilion Gate)",
          copies: 3,
          unitPrice: 0,
          totalAmount: 0,
          paymentMode: "FREE_VIP",
          buyerName: "Prof. Romila Thapar",
          designation: "Keynote Historian & Panelist",
          type: "VIP",
          voided: false
        },

        // Day 2: 2026-11-01
        {
          id: "TXN-2001",
          timestamp: "2026-11-01T09:30:00.000Z",
          counterId: "counter-01a",
          counterName: "Counter 01A (Main Lawn North)",
          copies: 4,
          unitPrice: 100,
          totalAmount: 400,
          paymentMode: "CASH",
          buyerName: "Aditi Roy",
          buyerPhone: "9845044444",
          type: "SALE",
          voided: false
        },
        {
          id: "TXN-2002",
          timestamp: "2026-11-01T10:15:00.000Z",
          counterId: "counter-01b",
          counterName: "Counter 01B (Main Lawn South)",
          copies: 2,
          unitPrice: 100,
          totalAmount: 200,
          paymentMode: "UPI",
          buyerName: "Tanmay Bhat",
          buyerPhone: "9845055555",
          type: "SALE",
          voided: false
        },
        {
          id: "TXN-2003",
          timestamp: "2026-11-01T11:00:00.000Z",
          counterId: "counter-02a",
          counterName: "Counter 02A (Auditorium Foyer)",
          copies: 75,
          unitPrice: 100,
          totalAmount: 7500,
          paymentMode: "CASH",
          buyerName: "Bangalore University Scholars",
          buyerPhone: "9845066666",
          type: "SALE",
          voided: false
        },
        {
          id: "TXN-2004",
          timestamp: "2026-11-01T13:30:00.000Z",
          counterId: "counter-02b",
          counterName: "Counter 02B (VIP Pavilion Gate)",
          copies: 2,
          unitPrice: 0,
          totalAmount: 0,
          paymentMode: "FREE_VIP",
          buyerName: "Justice Sanjeev Khanna",
          designation: "Distinguished Guest of Honour",
          type: "VIP",
          voided: false
        },
        {
          id: "TXN-2005",
          timestamp: "2026-11-01T15:10:00.000Z",
          counterId: "counter-01a",
          counterName: "Counter 01A (Main Lawn North)",
          copies: 2,
          unitPrice: 100,
          totalAmount: 200,
          paymentMode: "UPI",
          buyerName: "Pre-Order EVT-26-0101 (Murugan)",
          buyerPhone: "9845012345",
          type: "PREORDER_FULFILLMENT",
          voided: false
        },
        {
          id: "TXN-2006",
          timestamp: "2026-11-01T17:45:00.000Z",
          counterId: "counter-02a",
          counterName: "Counter 02A (Auditorium Foyer)",
          copies: 1,
          unitPrice: 100,
          totalAmount: 100,
          paymentMode: "CASH",
          buyerName: "Test Mistyped Entry",
          type: "SALE",
          voided: true,
          voidReason: "Volunteer mistyped cash payment while customer cancelled order",
          voidedAt: "2026-11-01T17:50:00.000Z",
          voidedBy: "Rohan Varma"
        },

        // Day 3 (Today): 2026-11-02
        {
          id: "TXN-3001",
          timestamp: "2026-11-02T00:05:00.000Z",
          counterId: "counter-01a",
          counterName: "Counter 01A (Main Lawn North)",
          copies: 2,
          unitPrice: 100,
          totalAmount: 200,
          paymentMode: "UPI",
          buyerName: "Siddharth M.",
          buyerPhone: "9845077777",
          type: "SALE",
          voided: false
        },
        {
          id: "TXN-3002",
          timestamp: "2026-11-02T00:12:00.000Z",
          counterId: "counter-01b",
          counterName: "Counter 01B (Main Lawn South)",
          copies: 1,
          unitPrice: 100,
          totalAmount: 100,
          paymentMode: "CASH",
          buyerName: "Harish Kumar",
          buyerPhone: "9845088888",
          type: "SALE",
          voided: false
        },
        {
          id: "TXN-3003",
          timestamp: "2026-11-02T00:20:00.000Z",
          counterId: "counter-02a",
          counterName: "Counter 02A (Auditorium Foyer)",
          copies: 1,
          unitPrice: 0,
          totalAmount: 0,
          paymentMode: "FREE_VIP",
          buyerName: "Deepak Satwalekar",
          designation: "Festival Trustee & Patron",
          type: "VIP",
          voided: false
        }
      ]
    }
  },
  
  // Platform Owner & Multi-Tenant Rental Registry
  platform: {
    ownerEmail: "safwanvgd313@gmail.com",
    rentals: [
      {
        id: "RENT-CS2026",
        hostEmail: "safwanvgd313@gmail.com",
        hostName: "Safwan (Platform Owner)",
        organization: "CounterSync Core Team",
        phone: "+91 98765 43210",
        eventKey: "CS2026",
        eventName: "Almuneer 2026",
        status: "ACTIVE", // ACTIVE | PENDING | DENIED | SUSPENDED | EXPIRED
        allowedCounters: 5,
        startsAt: "2026-10-30T00:00:00.000Z",
        expiresAt: "2027-12-31T23:59:59.000Z",
        requestedAt: "2026-10-30T00:00:00.000Z",
        approvedAt: "2026-10-30T00:00:00.000Z",
        notes: "Master flagship exhibition event"
      }
    ]
  }
};
