# IRIS - Intelligent Resolution Incident System
### *Organizational Knowledge & Incident Resolution Database*
**Course:** Database Systems (Review 1 Demo) &bull; **Institution:** VIT Vellore CSE Core

---

## 🚀 Quick Launch (How to Run the Demo)

### Method 1: Double click `run.bat`
Or in your terminal:
```powershell
cd C:\Users\aksha\.gemini\antigravity\scratch\iris-app\backend
python main.py
```

Then open your browser and navigate to:
👉 **[http://localhost:8000](http://localhost:8000)**

---

## 🎯 1-Minute Demo Walkthrough for Review 1

### Step 1: Open the App & Explain the Philosophy
- **Say:** *"Traditional systems like Jira only store text tickets without intelligence, while ChatGPT lacks internal organizational history. IRIS is an Organizational Incident Database where the relational database is the centerpiece."*

### Step 2: Log a New Incident
- Click one of the Demo Presets (e.g., **"Postgres Connection Timeout"**).
- Click **"Log to Database & Analyze with IRIS"**.
- Point to the live SQL Box:
  ```sql
  SELECT p.id, p.title, s.solution_text, s.confidence_score
  FROM problems p
  JOIN solutions s ON p.id = s.problem_id
  WHERE ...
  ```
- **Say:** *"Notice that before AI generates anything, the database performs a relational JOIN on our historical organizational records to extract validated past solutions."*

### Step 3: View the AI Synthesis
- Show the **Root Cause Diagnosis**, **Recommended Primary Solution**, **Actionable Steps**, and **Confidence Score (96%)**.

### Step 4: Closed-Loop Decision & Database Update
- Click **"Accept AI Recommendation & Ingest into SQL"** (or write a custom solution).
- Switch to the **Database Explorer** tab to show the professor:
  1. The new record inserted into the `solutions` table with foreign key `problem_id`.
  2. The `problems` table record updated to `status = 'RESOLVED'`.
  3. The `sql_query_logs` table tracking every query execution in real-time.

---

## 🗄️ Relational Database Architecture

```text
+-----------------------+          +--------------------------------------+
|       PROBLEMS        | 1      N |              SOLUTIONS               |
+-----------------------+----------+--------------------------------------+
| id (PK, AUTOINCREMENT)|          | id (PK, AUTOINCREMENT)               |
| title                 |          | problem_id (FK -> problems.id)       |
| description           |          | solution_text                        |
| category              |          | source ('AI' | 'Human')              |
| severity              |          | confidence_score                     |
| keywords              |          | root_cause                           |
| status (OPEN/RESOLVED)|          | action_steps                         |
| created_at            |          | created_at                           |
| resolved_at           |          +--------------------------------------+
+-----------------------+
```
