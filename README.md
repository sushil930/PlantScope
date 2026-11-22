# PlantScope AI

**PlantScope AI** is a full-stack botanical identification, scientific taxonomy, and preliminary plant disease screening web application built exclusively on free scientific APIs and open-source tools.

## Features

- **Plant Species Identification**: Upload 1 to 5 photographs (JPG, JPEG, PNG) of the same individual plant with optional organ tagging (`auto`, `leaf`, `flower`, `fruit`, `bark`) via the free **Pl@ntNet API**.
- **Seven-Rank Scientific Taxonomy**: Cross-checks the leading scientific name against the public **GBIF Taxon API** to display Kingdom, Phylum, Class, Order, Family, Genus, Species, and known synonyms without ever inventing missing ranks.
- **Beta Plant Disease Detection**: Optional pathology screening using Pl@ntNet's beta disease endpoint, clearly separated from species identification with EPPO codes, model scores, attribution, and scientific disclaimers.
- **Bilingual Interface (English & Hindi)**: Full `react-i18next` localization with persistent language selection while preserving canonical Latin scientific names and EPPO codes.
- **Local IndexedDB Scan History**: Private browser-side scan archive with search, newest/oldest sorting, delete, clear all, and opt-in local thumbnail storage (disabled by default). No user photographs are stored on the server.
- **Printable Botanical Reports**: Zero-cost browser print stylesheet (`@media print`) for exporting or printing structured botanical reports without paid PDF APIs.

## Architecture

- **Frontend** (`src/`): React 19, Vite, TypeScript, Tailwind CSS, Radix/shadcn-style UI primitives, Lucide icons, React Router, `react-i18next`, and IndexedDB.
- **Integrated Full-Stack Server** (`server.ts`, `server/`): Express + TypeScript server hosting `/api/*` endpoints alongside Vite on port `3000`.
- **Standalone Python FastAPI Backend** (`backend/`): Complete Python 3.12+ / FastAPI / Pydantic / HTTPX / Pillow implementation with identical `/api/*` contracts for Python deployments.

## External Free APIs

1. **Pl@ntNet API** — [https://my.plantnet.org/](https://my.plantnet.org/)
   - `POST /v2/identify/all`
   - `POST /v2/diseases/identify` (Beta)
   - `GET /v2/quota/daily`
   - `GET /v2/languages`
2. **GBIF Taxon API** — [https://api.gbif.org](https://api.gbif.org)
   - `GET /v2/species/match` (no API key required)

No paid APIs, paid AI providers, or fallback billing services are used.

## Getting a Free Pl@ntNet API Key

1. Create a free account at [https://my.plantnet.org/](https://my.plantnet.org/).
2. Open your account dashboard and generate a personal free-tier API key.
3. Copy `.env.example` to `.env` (and `backend/.env.example` to `backend/.env` if running the FastAPI backend).
4. Set `PLANTNET_API_KEY` to your private key. Never commit `.env` files to version control.

## Installation & Local Execution

### Option A: Integrated Full-Stack App (Node/Express + React/Vite on port 3000)

```bash
npm install
cp .env.example .env
# Edit .env and add your free PLANTNET_API_KEY
npm run dev
```

Open `http://localhost:3000`.

### Option B: Standalone Python FastAPI Backend + Vite Frontend

```bash
# Terminal 1: FastAPI Backend (port 8000)
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit backend/.env and add your free PLANTNET_API_KEY
uvicorn app.main:app --reload --port 8000

# Terminal 2: Vite Frontend (pointing to FastAPI)
VITE_API_BASE_URL=http://localhost:8000 npx vite --port 3000
```

## Running Automated Tests

All tests mock external API calls and consume zero API credits.

```bash
# TypeScript backend + frontend unit & integration tests
npm test

# Type-checking & production build
npm run lint
npm run build

# Python FastAPI tests (inside backend venv)
cd backend && pytest
```

## Security & Privacy

- `PLANTNET_API_KEY` is read strictly on the server and never exposed to the client or logged in error URLs.
- Uploaded files are verified by both MIME type and binary image signatures/headers strictly in memory and discarded after API forwarding.
- Scan history lives locally in browser IndexedDB; local photo thumbnail saving is opt-in and disabled by default.

## Known API Limitations

- **Daily Quota**: Free Pl@ntNet accounts share a daily request allowance across both `/v2/identify/all` and `/v2/diseases/identify`. Enabling disease screening uses 2 requests per scan. When HTTP 429 occurs, PlantScope AI disables scanning until reset and never retries automatically.
- **Disease Beta Coverage**: Pl@ntNet Disease Identification covers a limited set of crops and pathologies. `"No supported disease match"` does not guarantee a plant is healthy.
- **Hindi Metadata Coverage**: If Pl@ntNet does not return Hindi common names or disease descriptions for a species, PlantScope AI preserves verified Hindi UI labels and canonical Latin names while transparently displaying English API metadata.

## Attribution

- Plant identification powered by **Pl@ntNet** ([https://my.plantnet.org/](https://my.plantnet.org/)).
- Taxonomic backbone verification powered by **GBIF** ([https://www.gbif.org/](https://www.gbif.org/)).
