# Vidhi Setu — विधि सेतु
### AI Legislative Analyzer · ScaleDown Hackathon 2025

> **Bridge between citizens and the law.**
> Ask any question about Indian law in any language. Get a plain answer in seconds.

---

## The Problem

Indian laws are dense, verbose, and written in legal language that ordinary citizens cannot understand. A vegetable vendor in Pune hears on the news that the National Digital Data Governance Act 2025 affects her Aadhaar card. She doesn't have the PDF. She doesn't know which section. She speaks Marathi.

**She just types her question. Vidhi Setu does the rest.**

---

## How It Works

```
Citizen types question (any language)
         │
         ▼
Groq LLM identifies relevant Indian acts
         │
         ▼
Dataset fetches act text from 858 Central Acts (Zenodo)
         │
         ▼
ScaleDown compresses 100,000 tokens → ~800 relevant tokens
         │
         ▼
Groq answers in citizen's own language — plain words, zero jargon
```

**No language dropdown. No file upload. No legal knowledge required. Just a question.**

---

## Features

### Core — Ask Any Question
- Type in Hindi, Marathi, Tamil, Telugu, Bengali, English — any language
- System automatically finds the relevant act from 858 Central Acts
- ScaleDown compresses the act text from 100k tokens to ~800 relevant tokens
- Answer in the citizen's own language, citing the exact section

### Bonus A — Personalized Alert Profiles
- Upload a new bill as PDF
- Select interest areas (health, agriculture, taxation, education, data privacy...)
- ScaleDown batch-compresses the bill against each topic simultaneously
- Know exactly which parts of a new bill affect you

### Bonus B — Bill Comparison
- Upload old act + new bill as PDFs
- Ask what changed for you
- ScaleDown handles 200k+ tokens across two documents
- Plain-language diff: "The 2019 law said X. The 2025 bill changes it to Y."

---

## Demo

```
Question: रोज काम करने का कितना पैसा मिलना चाहिए?

Acts found: THE MINIMUM WAGES ACT, 1948

ScaleDown: 53,987 → 5,614 tokens (89.6% compression · 9.62x ratio)

Answer: न्यूनतम मजदूरी अधिनियम, 1948 के अनुसार, आपको आपके काम के लिए
न्यूनतम मजदूरी मिलनी चाहिए। न्यूनतम मजदूरी की दरें राज्य सरकार द्वारा
निर्धारित की जाती हैं...

This comes from Section 3 of the Minimum Wages Act, 1948.
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python + FastAPI |
| Compression | ScaleDown API |
| LLM | Groq (llama-3.3-70b-versatile) |
| Dataset | Zenodo — 858 Indian Central Acts |
| PDF Extraction | pdfplumber |
| Frontend | Plain HTML + CSS + Vanilla JS |
| Server | Uvicorn |

---

## Project Structure

```
ai-legislative-analyzer/
├── backend/
│   ├── main.py              # FastAPI — all endpoints
│   ├── dataset.py           # Zenodo loader + LLM-guided search
│   ├── scaledown_client.py  # ScaleDown API wrapper
│   ├── llm.py               # Groq API wrapper
│   ├── requirements.txt
│   └── .env                 # API keys (never commit)
├── frontend/
│   ├── index.html           # Single page dashboard
│   ├── style.css
│   └── app.js
├── data/
│   └── zenodo/              # 858 acts JSON files
└── README.md
```

---

## Setup

### 1. Download Dataset
Go to [zenodo.org/records/5088102](https://zenodo.org/records/5088102), download the ZIP, extract all JSON files into `data/zenodo/`.

### 2. Install Dependencies
```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Set API Keys
Create a `.env` file in the project root:
```
SCALEDOWN_API_KEY=your_scaledown_key_here
GROQ_API_KEY=your_groq_key_here
```

### 4. Run Backend
```bash
cd backend
uvicorn main:app --reload --port 8000
```

First startup takes 30–60 seconds to index 858 acts. Verify at:
```
http://localhost:8000/health
```

### 5. Open Frontend
```bash
cd frontend
python -m http.server 3000
```

Open `http://localhost:3000` in your browser.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/analyze` | Core Q&A pipeline |
| POST | `/alerts/match` | Bonus A — topic matching |
| POST | `/compare` | Bonus B — bill comparison |
| POST | `/extract-pdf` | Extract text from PDF |
| GET | `/health` | Health check |

---

## ScaleDown — The Core

ScaleDown replaces the entire RAG pipeline. No ChromaDB, no vector embeddings, no FAISS.

| | Without ScaleDown | With ScaleDown |
|---|---|---|
| Tokens per query | 53,987 (full act) | 5,614 (relevant clauses) |
| Compression ratio | 1x | 9.62x average |
| Cost per query | ~$0.30 | ~$0.002 |
| Context window | Hits limits | Well within limits |
| 200k token docs | Impossible | Handled cleanly |

---

## Languages Supported

Hindi · Marathi · Tamil · Telugu · Bengali · Gujarati · Kannada · Malayalam · Punjabi · Odia · Assamese · Urdu · English · and more

No language selection needed — the system auto-detects from your question.

---

## Dataset

**858 Indian Central Acts (1838–2020)** from [Zenodo](https://zenodo.org/records/5088102) — pre-processed from IndiaCode PDFs into structured JSON.

Why not IndiaCode directly? IndiaCode is a website for human browsing, not a developer API. No REST endpoints, no JSON, no programmatic access.

---

## Built With

- [ScaleDown](https://scaledown.xyz) — Token compression
- [Groq](https://groq.com) — LLM inference
- [Zenodo Dataset](https://zenodo.org/records/5088102) — 858 Indian Central Acts
- [FastAPI](https://fastapi.tiangolo.com) — Backend framework

---

*"Every citizen deserves to understand the law that governs them."*
