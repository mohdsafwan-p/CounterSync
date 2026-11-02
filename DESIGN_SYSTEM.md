# CounterSync — Design System & Style Guide

Complete specification of typography, primary brand colors, semantic UI palettes, and contrast hierarchy used across the production web application.

---

## 1. Typography System (Fonts)

CounterSync uses a dual-engine typography stack engineered for rapid rush-hour readability, crisp rendering on high-DPI retina mobile screens, and clean multilingual / Malayalam regional text support.

| Font Family | Weights Used | Purpose & UI Role | Fallback Stack |
| :--- | :--- | :--- | :--- |
| **Plus Jakarta Sans** | 500 (Medium), 600 (SemiBold), 700 (Bold), 800 (ExtraBold), 900 (Black) | **Primary App Font:** Main headings, metric figures, buttons, status badges, and English inputs. | `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` |
| **Manjari** | 400 (Regular), 700 (Bold) | **Regional / Malayalam Support (`.font-ml`):** Event names, volunteer names, customer notes, and counter labels. | `'Plus Jakarta Sans', sans-serif` |
| **JetBrains / UI Monospace** | 600 (SemiBold), 800 (ExtraBold), 900 (Black) | **Codes & Numbers (`.font-mono`):** Event Access Keys (`CS2026`), UPI IDs, and PIN entry inputs. | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` |

### CSS Implementation Tokens
```css
--font-primary: 'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
--font-ml: 'Manjari', 'Plus Jakarta Sans', sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
```

---

## 2. Core Brand Palette

The primary brand colors define the fintech identity: high-trust Electric Blue paired with deep enterprise Onyx Navy.

| Token / Color Name | Hex Code | Tailwind Equivalent | Primary Usage in App |
| :--- | :--- | :--- | :--- |
| **Electric Blue** | `#0066FF` | `text-brand-blue` / `bg-brand-blue` | App logo highlight, Primary CTA buttons ("Join Event", "Enter Workspace"), active counter badges, highlighted numbers. |
| **Electric Blue Hover** | `#0052CC` | `hover:bg-brand-blueHover` | Hover/active states on primary blue action buttons. |
| **Deep Onyx Navy** | `#0B132B` | `bg-brand-navy` | Super Admin Master Access Key banner, PWA theme-color, high-priority modals, dark headers. |
| **Dark Navy Core** | `#070B19` | `bg-brand-navyDark` | Contrast backgrounds for dark container cards and master controls. |

---

## 3. Semantic & Functional Colors

### 3.1 Emerald / Success Palette (Cash & Active Counters)
Used for physical cash, successful transactions, online sync indicator, and positive reconciliations.

| Role | Hex Code | Tailwind Class | Application |
| :--- | :--- | :--- | :--- |
| **Emerald Surface** | `#ECFDF5` | `bg-emerald-50` | Cash payment card background, synced pill container. |
| **Emerald Border** | `#A7F3D0` / `#10B981` | `border-emerald-200` / `border-emerald-500` | Active cash selector border, sync indicator border. |
| **Emerald Solid** | `#059669` / `#10B981` | `bg-emerald-600` / `text-emerald-500` | "Export CSV", "Add Press Batch", Live Counter badges, online pulse dot. |
| **Emerald Text** | `#047857` / `#065F46` | `text-emerald-700` | Financial metrics, revenue labels, cash handover indicators. |

### 3.2 Amber / Warning Palette (Stock Room, Pre-Orders & Alerts)
Used for the Central Stock Room, warehouse dispatches, pre-order tokens, and lock screen alerts.

| Role | Hex Code | Tailwind Class | Application |
| :--- | :--- | :--- | :--- |
| **Amber Light** | `#FFFBEB` | `bg-amber-50` | Incoming stock transit banner, pre-order warning containers. |
| **Amber Accent** | `#F59E0B` | `bg-amber-500` / `text-amber-500` | Stock room dispatch buttons, access keys, pre-order handover pills. |
| **Amber Highlight** | `#FBBF24` | `text-amber-400` / `border-amber-400` | Master access key text, dark mode stars and icons. |
| **Amber Dark** | `#92400E` / `#B45309` | `text-amber-700` / `text-amber-800` | Warehouse transit notification headers, pre-order labels. |

### 3.3 Purple / VIP Palette (Complimentary & Free Copies)
Used strictly for VIP issues, sponsor gift copies, and zero-revenue handovers.

| Role | Hex Code | Tailwind Class | Application |
| :--- | :--- | :--- | :--- |
| **Purple Light** | `#FAF5FF` | `bg-purple-50` | Direct warehouse complimentary issue container. |
| **Purple Border** | `#E9D5FF` | `border-purple-200` | Complimentary card borders. |
| **Purple Solid** | `#9333EA` | `bg-purple-600` / `text-purple-600` | Complimentary action buttons, VIP metrics in executive summary. |
| **Purple Dark Text** | `#3B0764` / `#7E22CE` | `text-purple-950` / `text-purple-700` | Section headings and sub-descriptions for free issues. |

### 3.4 Rose / Danger Palette (Low Stock, Void & Cancellations)
Used for critical alerts, low inventory warnings ($\le 10$ copies), transaction voiding, and cash shortages.

| Role | Hex Code | Tailwind Class | Application |
| :--- | :--- | :--- | :--- |
| **Rose Light** | `#FFF1F2` | `bg-rose-50` | Low stock banner background, void transaction prompt background. |
| **Rose Border** | `#FDA4AF` / `#FECDD3` | `border-rose-300` / `border-rose-200` | Low stock alert outlines, PIN confirmation dialog boxes. |
| **Rose Solid** | `#E11D48` / `#F43F5E` | `bg-rose-600` / `text-rose-500` | Confirm Void button, delete counter action, shortage alerts. |

---

## 4. Neutral & Surface Palette (Light & Dark AMOLED)

### 4.1 Light Mode
- **App Canvas Background:** `#F8FAFC` (`bg-[#F8FAFC]` / `bg-slate-50`)
- **Card & Modal Surfaces:** `#FFFFFF` (`bg-white`)
- **Primary Text / Headings:** `#0F172A` (`text-slate-900`)
- **Body / Subheadings:** `#334155` (`text-slate-700`) & `#64748B` (`text-slate-500`)
- **Borders & Dividers:** `#E2E8F0` (`border-slate-200`) & `#F1F5F9` (`border-slate-100`)

### 4.2 Dark AMOLED Mode (`.dark` / default night theme)
- **Canvas Background:** `#000000` (`dark:bg-black` — pure power-saving AMOLED black)
- **Card Surfaces:** `#111827` (`dark:bg-gray-900`)
- **Elevated Inner Boxes:** `#070B19` (`dark:bg-gray-950`)
- **Primary Text:** `#FFFFFF` (`dark:text-white`)
- **Muted Text:** `#94A3B8` (`dark:text-slate-400`)
- **Card Borders:** `#1F2937` (`dark:border-gray-800`)

---

## 5. Overlay & Transparency Tokens

- **Modal Backdrop:** `rgba(0, 0, 0, 0.70)` to `rgba(0, 0, 0, 0.80)` (implemented as `rgba(0, 0, 0, 0.75)` with `backdrop-filter: blur(8px)`)
- **Master Key Glass Container:** `rgba(0, 0, 0, 0.50)` with `rgba(245, 158, 11, 0.30)` amber glow border (`box-shadow: 0 0 20px rgba(245, 158, 11, 0.18)`).
- **Button Tap Feedback:** `transform: scale(0.97)` on `.press-effect:active`.
