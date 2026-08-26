# PDFKit Print Layout Reference (A4: 595 × 842 pt)

This document contains the exact coordinates, layout blocks, font requirements, and brand color palettes for the PDFKit generation engine in `nola-hq-backend`.

---

## 1. Page Geometry & Coordinate System

* **Dimensions**: `595 pt × 842 pt` (Standard ISO A4 @ 72 dpi)
* **Page Margins**: `50 pt` on all sides
* **Printable Area**: Width = **`495 pt`** ($X: 50 \to 545$), Height = **`742 pt`** ($Y: 50 \to 792$)

```
X=0                       X=50                                       X=545      X=595
┌──────────────────────────────────────────────────────────────────────────────────┐ Y=0
│ [Top Accent Bar: X=0, Y=0, Width=595, Height=5]                                 │
├─────────────────────────┬──────────────────────────────────────────────┬─────────┤ Y=50
│ (Margin 50pt)           │ HEADER (Width: 495, Height: 44)              │         │
│                         │ Left Brand (315pt)     Right Meta (180pt)    │         │
│                         ├──────────────────────────────────────────────┤ Y=98
│                         │ META CARDS (Width: 495, Height: 80)          │         │
│                         │ Card 1: 285pt   [15pt gap]   Card 2: 195pt   │         │
│                         ├──────────────────────────────────────────────┤ Y=200
│                         │ ITEMS TABLE (Width: 495, Dynamic Height)     │         │
│                         │ Desc: 245 | Qté: 40 | PU: 105 | Total: 105   │         │
│                         ├──────────────────────────────────────────────┤ Y=325
│                         │ FINANCIAL SECTION (Width: 495, Height: 110)  │         │
│                         │ Payment/Notes: 260pt [15pt] Totals/Card: 220 │         │
│                         ├──────────────────────────────────────────────┤ Y=447
│                         │ SIGNATURES & VALIDATION (Height: 90)         │         │
│                         │ (See Section 2 for Receipt vs Invoice layout)│         │
│                         ├──────────────────────────────────────────────┤ Y=755
│                         │ FOOTER (Width: 495, Height: 20)              │         │
│                         │ Brand Line: 300pt    Legal/Date: 195pt       │         │
└─────────────────────────┴──────────────────────────────────────────────┴─────────┘ Y=842
```

---

## 2. Component Coordinate Mapping

| Element | $X$ ($\text{pt}$) | $Y$ ($\text{pt}$) | Width ($\text{pt}$) | Height ($\text{pt}$) | PDFKit Drawing Command |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Top Accent Bar** | `0` | `0` | `595` | `5` | `doc.rect(0, 0, 595, 5).fill(gradient)` |
| **Header — Logo Box** | `50` | `50` | `40` | `40` | `doc.roundedRect(50, 50, 40, 40, 8)` |
| **Header — Brand Info** | `102` | `50` | `263` | `40` | `doc.text(title, 102, 50, { width: 263 })` |
| **Header — Document Title & Meta** | `365` | `50` | `180` | `44` | `doc.text(meta, 365, 50, { width: 180, align: 'right' })` |
| **Header Separator Line** | `50` | `98` | `495` | `1` | `doc.moveTo(50, 98).lineTo(545, 98).stroke('#E2E8F0')` |
| **Meta Card 1 (Client / Payeur)** | `50` | `108` | `285` | `80` | `doc.roundedRect(50, 108, 285, 80, 8)` |
| **Meta Card 2 (Document Details)** | `350` | `108` | `195` | `80` | `doc.roundedRect(350, 108, 195, 80, 8)` |
| **Items Table Outer Container** | `50` | `200` | `495` | dynamic | `doc.roundedRect(50, 200, 495, h, 8)` |
| ↳ *Col 1: Description* | `50` | — | `245` | — | `align: 'left'` ($X: 50 \to 295$) |
| ↳ *Col 2: Quantité* | `295` | — | `40` | — | `align: 'center'` ($X: 295 \to 335$) |
| ↳ *Col 3: Prix unitaire* | `335` | — | `105` | — | `align: 'right'` ($X: 335 \to 440$) |
| ↳ *Col 4: Montant Total* | `440` | — | `105` | — | `align: 'right'` ($X: 440 \to 545$) |
| **Financial Box Left (Notes/Terms)** | `50` | `325` | `260` | `110` | `doc.dash(3).roundedRect(50, 325, 260, 110, 8)` |
| **Totals Breakdown Table (Right)** | `325` | `325` | `220` | `46` | Key-value table ($X: 325 \to 545$) |
| **Grand Total Box** | `325` | `376` | `220` | `38` | `doc.roundedRect(325, 376, 220, 38, 6).fill(primary)` |
| **Amount in Words** | `325` | `418` | `220` | `24` | `doc.text(words, 325, 418, { width: 220, align: 'right' })` |
| **Verification & Signatures Line** | `50` | `447` | `495` | `1` | `doc.moveTo(50, 447).lineTo(545, 447).stroke('#E2E8F0')` |
| **Footer Separator Line** | `50` | `755` | `495` | `1` | `doc.moveTo(50, 755).lineTo(545, 755).stroke('#E2E8F0')` |
| **Footer Left (Brand Statement)** | `50` | `762` | `300` | `20` | `align: 'left'` ($X: 50 \to 350$) |
| **Footer Right (Legal & Timestamp)** | `350` | `762` | `195` | `20` | `align: 'right'` ($X: 350 \to 545$) |

---

## 3. Signature & Verification Layouts

### A. Receipts (`REÇU` — `receipt-yekoli.html`)
Receipts include a public verification token verified via `/verify/receipt/:token`:
* **QR Verification Card**: Width = `125 pt` ($X: 50 \to 175$)
* **Gap**: `15 pt`
* **Signature 1 (Caissier / Émetteur)**: Width = `170 pt` ($X: 190 \to 360$)
* **Gap**: `15 pt`
* **Signature 2 (Payeur)**: Width = `170 pt` ($X: 375 \to 545$)
* Total = $125 + 15 + 170 + 15 + 170 = 495\text{ pt}$.

### B. Invoices & Quotes (`FACTURE` / `DEVIS` — `invoice-nolaa.html`)
Invoices and quotes have no verification endpoint; the signatures are widened across the full width:
* **Signature 1 (Pour le prestataire)**: Width = `240 pt` ($X: 50 \to 290$)
* **Gap**: `15 pt`
* **Signature 2 (Bon pour accord / Pour le client)**: Width = `240 pt` ($X: 305 \to 545$)
* Total = $240 + 15 + 240 = 495\text{ pt}$.

---

## 4. Brand Color Palettes (`PDF_THEMES`)

All colors are literal hexadecimal values:

```typescript
export const PDF_THEMES = {
  emerald: { // Yekoli School Tenants
    primary: '#0F5132',
    primaryDark: '#0A3622',
    primaryLight: '#E8F5E9',
    accent: '#198754',
    badgeBg: '#DCFCE7',
    badgeText: '#15803D',
    highlightZero: '#198754',
  },
  navy: { // Vantelis IT
    primary: '#1E3A8A',
    primaryDark: '#172554',
    primaryLight: '#EFF6FF',
    accent: '#2563EB',
    badgeBg: '#DBEAFE',
    badgeText: '#1E40AF',
    highlightZero: '#2563EB',
  },
  indigo: { // Khi-Lab
    primary: '#4338CA',
    primaryDark: '#312E81',
    primaryLight: '#EEF2FF',
    accent: '#6366F1',
    badgeBg: '#E0E7FF',
    badgeText: '#3730A3',
    highlightZero: '#4F46E5',
  },
  slate: { // Nolaa Corp / Studio HQ
    primary: '#0F172A',
    primaryDark: '#020617',
    primaryLight: '#F1F5F9',
    accent: '#334155',
    badgeBg: '#E2E8F0',
    badgeText: '#0F172A',
    highlightZero: '#166534',
  },
  neutrals: {
    surface: '#FFFFFF',
    backgroundCard: '#F8FAFC',
    paymentBoxBg: '#FAFAFA',
    textMain: '#1E293B',
    textMuted: '#64748B',
    textLight: '#94A3B8',
    border: '#E2E8F0',
    borderFocus: '#CBD5E1',
    badgeGrayBg: '#EEF2F6',
  },
};
```

---

## 5. Required Vendored TrueType Fonts (`.ttf`)

| Font File | PostScript Key | Used For |
| :--- | :--- | :--- |
| `PlusJakartaSans-Regular.ttf` | `PJS-Regular` | Body descriptions, metadata keys, legal notes |
| `PlusJakartaSans-SemiBold.ttf`| `PJS-SemiBold`| Table headers, row titles, section badges |
| `PlusJakartaSans-Bold.ttf`    | `PJS-Bold`    | Document title, customer name, card headings |
| `PlusJakartaSans-ExtraBold.ttf`| `PJS-ExtraBold`| Monogram letter, institution title |
| `PlusJakartaSans-Italic.ttf`  | `PJS-Italic`  | Amount in words, secondary timestamps |
| `SpaceMono-Regular.ttf`       | `SpaceMono-Regular`| Dates, reference numbers, quantities |
| `SpaceMono-Bold.ttf`          | `SpaceMono-Bold`| Unit prices, total amounts, grand total banner |
