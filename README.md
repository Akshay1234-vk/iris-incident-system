# IRIS — Intelligent Resolution Incident System
### *Enterprise Organizational Knowledge & Database-Augmented Incident Resolution System*

---

## 📌 Overview

**IRIS** is an AI-assisted organizational incident resolution platform built around a database-first philosophy.

In modern engineering organizations, teams repeatedly encounter similar production outages, database locks, connection pool exhausts, and infrastructure anomalies. Conventional issue trackers (such as Jira or GitHub Issues) function merely as passive text logs without reasoning capabilities, while generic LLMs (such as stock ChatGPT) lack organizational history and internal infrastructure context.

**IRIS solves this by placing the Relational Knowledge Store at the center:**
1. Incidents are logged into a structured relational schema with operator audit tracking (`reported_by`).
2. The backend performs real-time relational queries and full-text search (SQLite FTS5 with BM25 ranking) across historical problem-solution pairs.
3. The **Google Gemini LLM** (via the official `google-genai` SDK) analyzes the current incident within the context of retrieved database precedents.
4. **Historical Grounding:** When past matches exist, the LLM cites verified organizational solutions (e.g. `[Incident #ID]`) and adapts them.
5. **Novel Incident Reasoning:** If no prior matches exist in the database, the LLM synthesizes a first-principles diagnosis and marks it as novel.
6. **Honest Engineering (Zero Fake AI):** If `GEMINI_API_KEY` is not configured or the provider is unavailable, IRIS does not fake AI answers. It displays the retrieved SQL records and provides a first-class manual resolution pathway.
7. **Closed-Loop Learning:** Once a solution is accepted or authored by an engineer, it is immediately ingested via SQL (`INSERT INTO solutions` + `UPDATE problems SET status = 'RESOLVED'`), instantly expanding organizational knowledge for all future incidents.

---

## 🏗️ Architecture & Tech Stack

```
+-----------------------------------------------------------------------------------+
|                                  WEB FRONTEND                                     |
|  Tailwind CSS • Real-Time SQL Query Log Viewer • Operator Switcher • Manual/AI UI |
+-----------------------------------------------------------------------------------+
                                        │  REST API (JSON)
                                        ▼
+-----------------------------------------------------------------------------------+
|                                FASTAPI BACKEND                                    |
|   • /api/problems (CRUD & Filters)           • /api/problems/{id}/analyze (AI)   |
|   • /api/problems/{id}/resolve (Ingestion)   • /api/auto-classify (Real-Time)    |
|   • /api/users (Operator Identity)           • /api/explorer/query (SQL Console) |
+-----------------------------------------------------------------------------------+
                  │                                                 │
                  │ SQL & FTS5 BM25 Queries                         │ Prompt & Precedents Context
                  ▼                                                 ▼
+--------------------------------------+   +----------------------------------------+
|      RELATIONAL KNOWLEDGE STORE      |   |            AI RESOLUTION ENGINE        |
|  SQLite 3 + FTS5 Full-Text Indexing  |   |  Google Gemini (Official google-genai) |
|  • problems (with reported_by audit) |   |  • Model: gemini-2.5-flash             |
|  • solutions (with resolved_by audit)|   |  • Structured JSON schema output       |
|  • users (operator directory)        |   |  • Citations of past database records  |
|  • sql_query_logs (query audit trail)|   |  • First-principles novel reasoning    |
+--------------------------------------+   +----------------------------------------+
```

### Relational Schema

```text
+-----------------------+          +--------------------------------------+
|       PROBLEMS        | 1      N |              SOLUTIONS               |
+-----------------------+----------+--------------------------------------+
| id (PK, AUTOINCREMENT)|          | id (PK, AUTOINCREMENT)               |
| title VARCHAR(255)    |          | problem_id (FK -> problems.id)       |
| description TEXT      |          | solution_text TEXT                   |
| category VARCHAR(100) |          | source ('AI (Gemini)' | 'Human')     |
| severity VARCHAR(50)  |          | resolved_by VARCHAR(100)             |
| keywords VARCHAR(255) |          | confidence_score REAL                |
| reported_by VARCHAR   |          | root_cause TEXT                      |
| status ('OPEN'|'RES') |          | action_steps TEXT                    |
| created_at TIMESTAMP  |          | created_at TIMESTAMP                 |
| resolved_at TIMESTAMP |          +--------------------------------------+
+-----------------------+
           │
           │ FTS5 Virtual Table & Triggers
           ▼
+--------------------------------------+
|             PROBLEMS_FTS             |
+--------------------------------------+
| title, description, keywords         |
| (Content synced via SQLite Triggers) |
| (BM25 ranking for fast retrieval)    |
+--------------------------------------+
```

---

## ⚡ Quick Start

### Prerequisites
- Python 3.10+ (tested on Python 3.13)
- Modern web browser

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Gemini API Key (Optional but Recommended)
Set the environment variable or create a `.env` file in the root directory:
```bash
# In PowerShell:
$env:GEMINI_API_KEY="your-gemini-api-key"

# Or in Linux/macOS:
export GEMINI_API_KEY="your-gemini-api-key"
```
*(You can also configure the key at runtime via the gear icon in the dashboard header.)*

### 3. Launch the Server
```bash
# Using Python directly:
python backend/main.py

# Or on Windows using batch script:
run.bat
```

Open your browser at: **[http://localhost:8000](http://localhost:8000)**

---

## 🧪 Running the Test Suite

The repository includes a comprehensive 15-test verification suite covering database seeding, FTS5 BM25 retrieval, Gemini context grounding, novel incident handling, provider error resilience, and manual resolution flows.

Run all tests:
```bash
python -m unittest discover backend -v
```

Or run individual test modules:
```bash
# Core database and end-to-end integration tests:
python backend/test_iris.py

# AI engine, LLM mocking, and failure mode tests:
python backend/test_ai_engine.py
```

---

## 🛡️ Key Implementation Details

1. **Genuinely AI-Driven:**
   - Powered by Google Gemini using the official `google-genai` SDK (`gemini-2.5-flash`).
   - Zero hardcoded solution dictionaries or static response templates.
   - Confidence scores are evaluated dynamically by the model based on evidence strength, not fabricated arithmetic constants.

2. **Database-Augmented Generation (DAG):**
   - Retrieves historical precedents using SQLite FTS5 with BM25 ranking joined with the relational `solutions` table.
   - Passes structured historical precedent objects (`incident_id`, `historical_root_cause`, `historical_solution`) into Gemini's context.

3. **Honest Failure Handling:**
   - If an API key is missing or invalid, the system reports `ai_available: false` with the exact reason.
   - Historical database records are still retrieved and displayed.
   - An intuitive manual resolution editor allows engineers to resolve incidents directly without disruption.

4. **Operator Ownership & Auditing:**
   - Every incident records `reported_by` (e.g. Lead SRE, Backend Engineer).
   - Every resolution records `resolved_by` and `source` (`AI (Gemini)` or `Human`).
   - Every database query is tracked in `sql_query_logs` with execution time and parameters.
