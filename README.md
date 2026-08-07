# 🌐 PacketGrader v2.0 — AI-Powered Cisco Packet Tracer Auto-Evaluation System

**PacketGrader v2.0** is an enterprise-grade, automated grading and simulation platform for Cisco Packet Tracer lab assessments. It enables automated grading of `.pkt` / `.pka` Packet Tracer files against AI-generated or custom evaluation plans, features an interactive in-browser Cisco canvas simulator with real-time CLI terminal execution, and enforces strict security proctoring to prevent exam malpractice.

---

## 🏛️ System Architecture

```mermaid
flowchart TB
    subgraph Client["🖥️ Student & Admin Frontend (React + Vite)"]
        UI["React SPA UI"]
        Canvas["ReactFlow Canvas Engine (Straight Vector Cables)"]
        CLI["Cisco IOS Terminal Emulator"]
        ProctorEngine["Proctoring Guard (Fullscreen, Anti-Copy/Paste, Anti-Screenshot)"]
    end

    subgraph Backend["⚡ Backend Service (FastAPI + Python)"]
        API["REST API Router (/api/*)"]
        AuthModule["JWT Auth & Role Control (Admin, Professor, Student)"]
        AuditService["Audit Log & Session Monitor Engine"]
        EvalEngine["Evaluation Engine"]
    end

    subgraph Converter["⚙️ Packet Tracer Conversion & Parsing"]
        PKA2XML["pka2xml Binary (C++)"]
        XMLParser["XML Parser (lxml / ElementTree)"]
        NetworkModels["ParsedNetwork Data Model"]
    end

    subgraph Validators["🔍 Validator Catalog (16 Protocol Modules)"]
        VLAN["VLAN Validator"]
        TRUNK["Trunk Validator"]
        STP["STP Validator"]
        OSPF["OSPF Validator"]
        RIP["RIP Validator"]
        EIGRP["EIGRP Validator"]
        ACL["ACL Validator"]
        NAT["NAT Validator"]
        DHCP["DHCP Validator"]
        ROUTING["Static & Default Routing"]
        INT["Interface Validator"]
        CONN["Connectivity & Ping"]
        SEC["Security & Passwords"]
        VTP["VTP Validator"]
        ETHER["EtherChannel Validator"]
        HOST["Hostname Validator"]
    end

    subgraph Storage["🗄️ Database & Storage"]
        SQLite["SQLite / PostgreSQL DB (SQLAlchemy)"]
        Files["Uploads & PDF Reports Storage"]
    end

    subgraph AI["🤖 AI Plan Generator"]
        Gemini["Google Gemini 2.5 Flash API"]
    end

    %% Flow Connections
    UI --> API
    Canvas --> API
    CLI --> API
    ProctorEngine -->|Report Violations Live| API

    API --> AuthModule
    API --> AuditService
    API --> EvalEngine
    API --> Gemini

    AuditService --> SQLite
    AuthModule --> SQLite

    EvalEngine --> PKA2XML
    PKA2XML --> XMLParser
    XMLParser --> NetworkModels
    NetworkModels --> Validators
    Validators --> EvalEngine
    EvalEngine --> SQLite
    EvalEngine --> Files
```

---

## ✨ Key Features & Architectural Layers

### 1. 🛡️ Advanced Proctoring & Anti-Malpractice System
- **Fullscreen Lockdown**: Automatically requests and enforces full-screen mode for students.
- **Shortcuts & Clipboard Blocking**: Intercepts and blocks `Ctrl+C`, `Ctrl+V`, `Ctrl+X`, `Cmd+C`, `Cmd+V`, `Cmd+X`, `PrintScreen`, `Ctrl+P`, `Cmd+Shift+3/4/5`, and right-click context menu events.
- **Real-Time Intimation & Audit Logs**: Every violation attempt triggers an instant HTTP warning report to the backend. Warning counts (1/3, 2/3, 3/3 Locked) and violation reasons update live on the Admin Session Control Dashboard (`SessionsPage.jsx`).
- **Auto-Submission on Lock**: Reaching 3 violations automatically locks the exam session, logs a `PROCTOR_VIOLATION` audit record, deactivates student login, and submits the candidate's current progress.

### 2. ⚡ Interactive Cisco Canvas & IOS Terminal Simulator
- **100% Straight Vector Cables**: Crisp vector rendering (`L ${tx} ${ty}`) for single and parallel cabling connections without unwanted Bezier bending.
- **Dynamic Handle Fallbacks & Port Counts**: Real-time Zustand reactive state management ensures device port indicators (`connectedCables`) update immediately upon wire attachment or deletion.
- **Cisco IOS CLI Engine**: Terminal supporting User EXEC (`Router>`), Privileged EXEC (`Router#`), Global Configuration (`(config)#`), and interface modes with tab completion, ambiguous command handling, and `show` command execution.

### 3. 🔍 Comprehensive 16-Module Validator Catalog
- **OSPF**: Process ID, `router-id`, area configuration, network statements with wildcard masks, passive interfaces, and `default-information originate`.
- **RIP**: RIP v1/v2, network advertisements, `no auto-summary`, and `default-information originate`.
- **EIGRP**: Autonomous System (AS) number, subnet advertisements with wildcard masks, `no auto-summary`, and passive interfaces.
- **Static & Default Routing**: Explicit destination prefix/mask next-hop routing and `0.0.0.0 0.0.0.0` default gateways.
- **VLAN & Trunking**: 802.1Q encapsulation, allowed VLAN lists, native VLANs, and VTP domain/modes.
- **Security & Infrastructure**: Console/VTY passwords, enable secrets, SSH configurations, DHCP pools/relays, NAT (inside/outside/static/overload), ACL rules, and EtherChannel port-channels.

### 4. 🤖 AI Evaluation Plan Generator
- Integrated with **Google Gemini 2.5 Flash API** to parse natural language question descriptions or topic prompts into structured JSON evaluation plans containing test cases, parameters, and weighted scoring rules.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite 6, ReactFlow 12, Zustand, React Icons, Vanilla CSS |
| **Backend Framework** | Python 3.10+, FastAPI, Uvicorn, Gunicorn |
| **Database & ORM** | SQLAlchemy 2.0, SQLite (Dev/Prod) / PostgreSQL, Pydantic v2 |
| **Parsing Engine** | `pka2xml` (C++ binary converter), `lxml` XML ElementTree |
| **AI Integration** | Google Gemini 2.5 Flash (`google-genai` SDK) |
| **PDF Generation** | ReportLab 5.0 |

---

## 📁 Repository Directory Structure

```text
newnetwork/
├── backend/
│   ├── app/
│   │   ├── api/                # FastAPI endpoints (auth, student, topics, questions, etc.)
│   │   │   ├── auth.py         # Login, user management, slot assignment, user deletion
│   │   │   ├── student.py      # Test session lifecycle, proctor warnings, all-sessions monitor
│   │   │   ├── questions.py    # Question CRUD & Gemini plan generation
│   │   │   ├── evaluations.py  # File upload & automated grading pipeline
│   │   │   └── router.py       # Main API Router aggregator
│   │   ├── core/               # Parsing and evaluation core
│   │   │   ├── network_models.py # Dataclasses for Device, RunningConfig, PortInfo, Link
│   │   │   ├── xml_parser.py     # XML to network_models parser
│   │   │   ├── converter.py      # Integration wrapper for pka2xml
│   │   │   └── evaluation_engine.py # Automated test runner
│   │   ├── db/                 # Database engine, SessionLocal, auto-migrations
│   │   ├── models/             # SQLAlchemy ORM models (User, Question, TestSession, AuditLog, etc.)
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   ├── services/           # Business logic (audit_service, auth_service, pdf_service)
│   │   ├── validators/         # 16 protocol validator modules (ospf, rip, eigrp, vlan, etc.)
│   │   ├── config.py           # Base Settings loader
│   │   └── main.py             # FastAPI entry point & SPA static mount
│   ├── requirements.txt        # Backend dependencies
│   └── pteval.db               # SQLite Database
├── frontend/
│   ├── src/
│   │   ├── features/           # Canvas engine, CableEdge (straight vector), CLI Terminal, Devices
│   │   ├── pages/              # AdminPage, SessionsPage, StudentTestPage, LabPage, AuditLogsPage
│   │   ├── services/           # Axios API client wrapper
│   │   ├── store/              # Zustand project state store
│   │   └── main.jsx            # React root entry point
│   ├── dist/                   # Built production SPA static assets
│   └── package.json            # Frontend NPM dependencies
├── pka2xml/
│   └── pka2xml                 # Executable binary converter
└── README.md                   # System Architecture & Documentation
```

---

## ⚙️ Environment Configuration (`.env`)

Create a `.env` file in the `backend/` directory:

```env
APP_NAME="Packet Tracer Auto Evaluator"
APP_VERSION="2.0.0"
DEBUG=False

# Database
DATABASE_URL="postgresql+psycopg2://username:password@localhost:5432/netpiolet_db"

# JWT Secret
JWT_SECRET_KEY="your-random-production-secret-key-change-this"
JWT_ALGORITHM="HS256"
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=480

# Google Gemini AI API Key
GEMINI_API_KEY="your_gemini_api_key_here"
GEMINI_MODEL="gemini-2.5-flash"

# Binary Location (Defaults to relative path)
PKA2XML_BINARY_PATH="../pka2xml/pka2xml"

# Allowed Domain for Google OAuth
ALLOWED_EMAIL_DOMAIN="bitsathy.ac.in"
```

---

## 🚀 Installation & Running Locally

### 1. Backend Setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python3 -c "from app.db.session import create_tables; create_tables()"
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

---

## 🧪 Testing & Verification

### Run CLI Terminal Tests
```bash
node frontend/src/features/cli/tests/run_tests.js
```

### Run Cisco Routing Protocols Verification Suite
```bash
cd backend
source venv/bin/activate
python3 scratch/test_routing_protocols.py
```

---

## 📦 Production Deployment (Without Docker)

1. **Build Frontend Static Assets**:
   ```bash
   cd frontend
   npx vite build
   ```
2. **Grant Executable Permissions to Converter**:
   ```bash
   chmod +x pka2xml/pka2xml
   ```
3. **Launch Production Application**:
   ```bash
   cd backend
   source venv/bin/activate
   gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:8000
   ```
   *FastAPI automatically serves both the API endpoints (`/api/*`) and the compiled production React SPA frontend (`/`) on port 8000.*
