# 🍱 Zomato KPT — Kitchen Prep Time Signal Improvement

> **Ideathon Submission | Problem Statement 1**
> Improving Kitchen Prep Time (KPT) Prediction to Optimize Rider Assignment and Customer ETA at Zomato

---

## 📌 Problem Summary

Zomato's KPT prediction relies on a single input — a merchant manually pressing a **"Food Ready" (FOR)** button on the Mx app. This creates systematic bias:

- Merchants often mark food ready **when the rider arrives**, not when food is actually packed
- The system has **zero visibility** into non-Zomato kitchen load (dine-in, Swiggy, catering)
- A corrupted signal has been **poisoning training data for years**

The result: inaccurate ETAs, early rider dispatch, increased waiting time, and order delays.

> **Core insight: The fix is not a better model. The fix is better signals.**

---

## 💡 Our Solution — Four-Layer Signal Stack

### 1. 📦 Smart Dispatch Station *(Primary Hardware Innovation)*

A counter-mounted device that **physically fuses the packing action with the FOR signal**.

**How it works:**
- Staff place the sealed food bag on the station platform
- Device detects placement via weight sensor
- Thermal label prints automatically (order ID, rider name, items, packed timestamp)
- FOR signal fires to Zomato **simultaneously** — same physical moment, zero gap

**Why this is the breakthrough:**
There is no way to fire a FOR signal without a bag physically on the station. Rider-influenced marking becomes structurally impossible — the physics of the action guarantees signal integrity.

**Merchant adoption driver:**
The label solves a problem restaurants already have — at a busy counter with 6 bags, nobody knows which bag belongs to which rider. Labels eliminate counter chaos. The merchant's motivation is entirely self-interested; FOR signal accuracy is a free byproduct.

**Hardware cost:** ₹4,000 – ₹6,500 per unit (ESP32 + thermal printer + WiFi module)

**Label format:**
```
┌──────────────────────────────┐
│  ZOMATO  #ZOM-48291          │
│  Rider: Rahul K.             │
│  2x Biryani · 1x Raita       │
│  Packed: 1:34 PM             │
│  [QR Code]                   │
└──────────────────────────────┘
```

**Bonus — weight validation:**
The optional weight sensor validates order completeness before the label prints. If a bag weighs outside the expected range for the ordered items, a red LED + alert fires on the Mx app before the rider even arrives.

---

### 2. 🖨 POS / Billing Integration

Integrate with India's most common restaurant POS systems — **Petpooja, Posist, UrbanPiper** — so that the billing event itself becomes the FOR signal. No merchant action required beyond what they already do for their own billing.

**Why this is structurally unbiased:**
A POS-generated signal reflects the restaurant's own internal record — not a signal created for Zomato's benefit. The merchant has no reason to manipulate their own billing timestamp.

**Coverage:** ~35–40% of Zomato's restaurant base already uses a POS system. UrbanPiper acts as existing middleware between Zomato and POS systems — no new integration from scratch required.

---

### 3. 🔊 IoT Kitchen Activity Sensor

A small device installed in the kitchen that measures ambient activity level and sends a **Kitchen Activity Index** (0–100) to Zomato every 30 seconds.

**The unique value:** This is the **only signal that captures non-Zomato kitchen load** — dine-in orders, Swiggy orders, catering — which can double actual prep time while Zomato's model sees nothing.

**Privacy design:** The device does not record audio. It captures only a sound pressure level — a single normalised number — and transmits only that number. No audio is ever stored or transmitted.

**Indian context:** Indian restaurants handling simultaneous dine-in and delivery during lunch (1–2pm) and dinner rush (8–10pm) see kitchen load underestimated by **30–60%** in Zomato's current model. The IoT sensor closes this blindspot.

**Hardware cost:** Under ₹1,500 per unit (ESP32 + MEMS sound sensor + WiFi module)

**Data flow:**
```
Kitchen ambient sound
    → ESP32 computes 30-sec average dB
    → Normalises to 0–100 index
    → MQTT push to cloud
    → Kafka stream → Feature store → KPT model
```

---

### 4. 🧹 FOR Label De-biasing

A **data quality fix** that costs nothing to implement — targeting the corrupted historical training data.

**Method — Confidence-weighted training:**
```
FOR timestamp within 90 seconds of rider arrival → LOW confidence label
FOR timestamp >120 seconds before rider arrival  → HIGH confidence label
Model trains with sample_weight = label_confidence
```

**Per-merchant FOR Reliability Score:** A rolling 30-day metric of how often a merchant's FOR markings are rider-independent. Used as a confidence multiplier on their signals in real time.

---

## 🏗 System Architecture

```
SIGNAL LAYER (real-time inputs)
├── Smart Dispatch Station   → Physical bag placement event (sub-second)
├── POS / Billing API        → Order status webhook (sub-second)
├── IoT Activity Sensor      → Kitchen load index (every 30 seconds)
└── FOR Label De-biasing     → Confidence-weighted training labels

FEATURE STORE (batch + live)
├── Batch (daily):  Historical KPT distributions, Reliability scores, Item complexity weights
└── Live (Redis):   Order rush index, IoT activity index, POS status, Mx signals

KPT PREDICTION ENGINE
├── Restaurant tier classifier
├── Item complexity scorer (Biryani=1.4x, Cold Coffee=0.5x, etc.)
├── Non-Zomato load estimator (IoT-fed)
└── Quantile predictions: P25, P50, P75 (not just a point estimate)

DISPATCH DECISION ENGINE
├── Hold rider until: predicted_KPT - rider_travel_time
├── Reliable kitchen → use P50 for dispatch timing
├── Unreliable kitchen → use P75 (conservative, reduces wait)
└── Graceful degradation: if any signal fails → fallback to next layer
```

**Graceful degradation order:**
```
Smart Dispatch Station
    → POS API
        → IoT Sensor
            → FOR De-biasing
                → Historical Pattern Model  ← always available, zero dependencies
```

---

## 🏪 Tiered Deployment Across 300,000 Restaurants

| Tier | Restaurant Type | Share | Signal Stack |
|------|----------------|-------|-------------|
| **Tier 1** | Cloud kitchens, QSR chains | ~5% | POS integration + Smart Dispatch Station |
| **Tier 2** | Mid-size organised restaurants | ~25% | POS via UrbanPiper + Smart Dispatch Station |
| **Tier 3** | Single-outlet active Mx users | ~35% | Smart Dispatch Station + IoT Sensor |
| **Tier 4** | Traditional dhabas, home kitchens | ~35% | FOR De-biasing + Historical model |

---

## 📊 Simulation

An interactive Monte Carlo simulation (700 synthetic orders per run) demonstrates signal improvement across all four success metrics simultaneously.

### How to Run

**Option 1 — Claude.ai (recommended for live demo):**
1. Open a new Claude chat at [claude.ai](https://claude.ai)
2. Paste the simulation `.jsx` file contents
3. Claude renders it as a live interactive app instantly — no setup

**Option 2 — CodeSandbox (online):**
1. Go to [codesandbox.io](https://codesandbox.io) → Create → React
2. Replace `App.js` with simulation code
3. Run `npm install recharts` in terminal

**Option 3 — Local:**
```bash
npx create-react-app kpt-sim
cd kpt-sim
npm install recharts
# Replace src/App.js with simulation code
npm start
```

### What the Simulation Models

- **Restaurant tiers** with calibrated KPT distributions, variance, and rider bias rates
- **Indian rush hours** — lunch (1–2pm, 1.7x load) and dinner (8–10pm, 1.8x load)
- **Non-Zomato kitchen load** as a hidden variable — only IoT sensor reduces this blindspot
- **Dish complexity weights** — Biryani (1.4x), Thali (1.3x), Cold Coffee (0.5x)
- **Smart Dispatch Station** modeled as near-ground-truth signal (82% noise reduction)
- **Confidence-weighted training** for label de-biasing

### Simulation Views

| Tab | What it shows |
|-----|--------------|
| All Metrics | Rider wait + ETA error as area charts across the day |
| By Hour | All 4 metrics across 24 hours — lunch and dinner peaks clearly visible |
| By Restaurant | How each tier benefits differently from each signal |
| By Dish | Biryani and Thali show largest absolute improvement |
| Radar | All 5 success metrics collapsing inward simultaneously |

---

## 📈 Impact on Success Metrics

| Metric | How our solution addresses it |
|--------|------------------------------|
| **Rider wait time at pickup** | Smart Dispatch Station fires FOR at exact packing moment — dispatch timing becomes precise |
| **ETA prediction error P50/P90** | Physically verified timestamps replace manually pressed buttons — cleaner labels → better model |
| **Order delay and cancellation rates** | Quantile-based dispatch holds riders until the right moment — food doesn't wait, riders don't wait |
| **Rider idle time** | Dispatch engine uses P75 for unreliable kitchens — riders sent later, arrive as food is packed |

---

## 🌍 Global Benchmarks

| Platform | What they do | How we compare |
|----------|-------------|----------------|
| **CloudKitchens** | Owns kitchens → full real-time order visibility | We replicate this via POS + Dispatch Station without owning kitchens |
| **DoorDash DeepRed** | ML-based KPT + MIP dispatch hold logic | We implement equivalent dispatch hold logic using quantile predictions |
| **Swiggy** | Cloud Menu API syncs POS to platform in 2 seconds | We leverage same UrbanPiper middleware already connecting both platforms |
| **Uber Eats** | Decoupled ETA from merchant-only signals | We go further — physically eliminate the biased signal at source |

---

## 🔑 Key Innovation Summary

> **We didn't build a better button. We made the button unnecessary — the act of packing the order becomes the signal, the label proves it happened, and the sensor sees what Zomato was blind to.**

---

## 📁 Repository Structure

```
/
├── README.md                   ← This file
├── simulation/
│   └── kpt_simulation.jsx      ← Interactive Monte Carlo simulation (React)
└── solution/
    └── solution_brief.md       ← Full written solution for submission
```

---

## 👥 Team

Submitted for **Sunrise Mentors × Zomato Ideathon**
Problem Statement 1 — Kitchen Prep Time Signal Improvement
