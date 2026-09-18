"""
IRIS (Intelligent Resolution Incident System)
Database Engine & Relational Knowledge Store
With User Authentication, Audit Ownership (reported_by, resolved_by) & IST Timestamps
"""

import sqlite3
import os
import json
import time
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "iris_knowledge.db")

def get_now_ist() -> str:
    """Returns formatted local time (IST)."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def log_query(query_type: str, query_text: str, params: Optional[Any] = None, rows_affected: int = 0, exec_time_ms: float = 0.0):
    try:
        conn = get_db_connection()
        params_str = json.dumps(params) if params is not None else ""
        now_ts = get_now_ist()
        conn.execute(
            """INSERT INTO sql_query_logs (query_type, query_text, params, rows_affected, execution_time_ms, timestamp)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (query_type, query_text.strip(), params_str, rows_affected, round(exec_time_ms, 2), now_ts)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error logging query: {e}")

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(100) UNIQUE NOT NULL,
        full_name VARCHAR(150) NOT NULL,
        role VARCHAR(100) NOT NULL,
        created_at TIMESTAMP
    );
    """)

    # 2. Problems Table (With reported_by user ownership)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS problems (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(100) NOT NULL,
        severity VARCHAR(50) NOT NULL DEFAULT 'Medium',
        keywords VARCHAR(255),
        reported_by VARCHAR(100) NOT NULL DEFAULT 'Akshay (Lead SRE)',
        status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
        created_at TIMESTAMP,
        resolved_at TIMESTAMP
    );
    """)

    # 3. Solutions Table (With resolved_by user ownership & Foreign Key)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS solutions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        problem_id INTEGER NOT NULL,
        solution_text TEXT NOT NULL,
        source VARCHAR(50) NOT NULL DEFAULT 'AI',
        resolved_by VARCHAR(100) NOT NULL DEFAULT 'Akshay (Lead SRE)',
        confidence_score REAL DEFAULT 1.0,
        root_cause TEXT,
        action_steps TEXT,
        created_at TIMESTAMP,
        FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
    );
    """)

    # 4. SQL Query Logs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sql_query_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query_type VARCHAR(50) NOT NULL,
        query_text TEXT NOT NULL,
        params TEXT,
        rows_affected INTEGER DEFAULT 0,
        execution_time_ms REAL DEFAULT 0.0,
        timestamp TIMESTAMP
    );
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_problems_category ON problems(category);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_problems_status ON problems(status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_solutions_problem_id ON solutions(problem_id);")

    conn.commit()
    conn.close()

def get_seed_users() -> List[Dict[str, Any]]:
    today = datetime.now().strftime("%Y-%m-%d")
    return [
        {"username": "akshay", "full_name": "Akshay Kumar", "role": "Lead SRE", "created_at": f"{today} 08:00:00"},
        {"username": "priya", "full_name": "Priya Sharma", "role": "Database Administrator", "created_at": f"{today} 08:00:00"},
        {"username": "rahul", "full_name": "Rahul Verma", "role": "Backend Engineer", "created_at": f"{today} 08:00:00"},
        {"username": "ananya", "full_name": "Ananya Patel", "role": "Cloud Architect", "created_at": f"{today} 08:00:00"}
    ]

def get_seed_data() -> List[Dict[str, Any]]:
    today = datetime.now().strftime("%Y-%m-%d")
    return [
        {
            "title": "Slow API Response on User Profile Page",
            "description": "User profile API takes over 5 seconds to load when fetching customer details.",
            "category": "Performance",
            "severity": "High",
            "keywords": "api, latency, slow query, missing index, performance",
            "reported_by": "Rahul Verma (Backend Engineer)",
            "status": "RESOLVED",
            "created_at": f"{today} 08:30:00",
            "resolved_at": f"{today} 08:45:00",
            "solution": {
                "solution_text": "Added B-Tree database index on users(email, status) and cached profile results in Redis for 10 minutes.",
                "source": "Human",
                "resolved_by": "Priya Sharma (Database Administrator)",
                "confidence_score": 0.96,
                "root_cause": "Full table scan on the users table due to missing index on frequently filtered columns.",
                "action_steps": "1. Run CREATE INDEX idx_users_email_status ON users(email, status);\n2. Add 10-minute Redis caching on GET /profile.\n3. Verify API latency drops from 5.2s to 45ms."
            }
        },
        {
            "title": "User Login Failing with 401 Unauthorized",
            "description": "Users are unable to log in and receive 401 Unauthorized errors after password reset.",
            "category": "Authentication",
            "severity": "High",
            "keywords": "login, auth, 401, jwt, password, token",
            "reported_by": "Akshay Kumar (Lead SRE)",
            "status": "RESOLVED",
            "created_at": f"{today} 08:50:00",
            "resolved_at": f"{today} 09:05:00",
            "solution": {
                "solution_text": "Refreshed JWT secret validation and updated auth service to issue fresh tokens upon password reset.",
                "source": "AI",
                "resolved_by": "Akshay Kumar (Lead SRE)",
                "confidence_score": 0.94,
                "root_cause": "Old session token was not invalidated properly and client sent expired credentials.",
                "action_steps": "1. Invalidate previous session tokens on password change.\n2. Issue new signed JWT token immediately after reset.\n3. Update client cookie storage."
            }
        },
        {
            "title": "Database Connection Timeout Under Heavy Load",
            "description": "Database rejects new incoming connections with timeout error when traffic surges.",
            "category": "Database",
            "severity": "Critical",
            "keywords": "database, timeout, connection pool, postgres, max connections",
            "reported_by": "Ananya Patel (Cloud Architect)",
            "status": "RESOLVED",
            "created_at": f"{today} 09:10:00",
            "resolved_at": f"{today} 09:25:00",
            "solution": {
                "solution_text": "Configured database connection pooling with max size of 50 and closed idle backend connections.",
                "source": "Human",
                "resolved_by": "Priya Sharma (Database Administrator)",
                "confidence_score": 0.98,
                "root_cause": "Each request opened a new database connection without reusing existing ones, hitting the connection limit.",
                "action_steps": "1. Enable connection pooling in backend database settings.\n2. Set max_connections = 50 and idle_timeout = 10000ms.\n3. Ensure connections are closed inside try/finally blocks."
            }
        },
        {
            "title": "Payment Gateway Network Timeout",
            "description": "Checkout page times out while waiting for response from payment provider during checkout.",
            "category": "Network",
            "severity": "Critical",
            "keywords": "payment, network, timeout, gateway, checkout",
            "reported_by": "Rahul Verma (Backend Engineer)",
            "status": "RESOLVED",
            "created_at": f"{today} 09:30:00",
            "resolved_at": f"{today} 09:42:00",
            "solution": {
                "solution_text": "Added request timeout threshold (5 seconds), retry with exponential backoff, and webhook fallback listener.",
                "source": "AI",
                "resolved_by": "Akshay Kumar (Lead SRE)",
                "confidence_score": 0.92,
                "root_cause": "Third-party payment gateway delayed responses without explicit timeout handling on client.",
                "action_steps": "1. Set HTTP request timeout to 5000ms.\n2. Implement 3-time retry with exponential backoff.\n3. Rely on asynchronous payment webhooks for final status."
            }
        },
        {
            "title": "Deadlock Detected on Money Transfer Transaction",
            "description": "Simultaneous fund transfers between user accounts failed with database deadlock error.",
            "category": "Database",
            "severity": "High",
            "keywords": "deadlock, transfer, transaction, sql, lock",
            "reported_by": "Priya Sharma (Database Administrator)",
            "status": "RESOLVED",
            "created_at": f"{today} 09:45:00",
            "resolved_at": f"{today} 09:55:00",
            "solution": {
                "solution_text": "Enforced sorted lock acquisition by account ID in ascending order before updating account balances.",
                "source": "Human",
                "resolved_by": "Priya Sharma (Database Administrator)",
                "confidence_score": 0.97,
                "root_cause": "Two concurrent transactions locked accounts in reverse order (A then B vs B then A), causing circular wait.",
                "action_steps": "1. Always sort account IDs in ascending order (min_id, max_id).\n2. Acquire SELECT ... FOR UPDATE in that exact order.\n3. Commit transaction immediately after balance updates."
            }
        }
    ]

def seed_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Seed users
    cursor.execute("SELECT COUNT(*) as count FROM users;")
    u_count = cursor.fetchone()["count"]
    if u_count == 0:
        for u in get_seed_users():
            cursor.execute(
                """INSERT INTO users (username, full_name, role, created_at)
                   VALUES (?, ?, ?, ?)""",
                (u["username"], u["full_name"], u["role"], u["created_at"])
            )

    # Seed problems & solutions
    cursor.execute("SELECT COUNT(*) as count FROM problems;")
    count = cursor.fetchone()["count"]

    if count == 0:
        print("Seeding database with user-ownership incident dataset...")
        seeds = get_seed_data()
        for item in seeds:
            cursor.execute(
                """INSERT INTO problems (title, description, category, severity, keywords, reported_by, status, created_at, resolved_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (item["title"], item["description"], item["category"], item["severity"], item["keywords"], item["reported_by"], item["status"], item["created_at"], item["resolved_at"])
            )
            problem_id = cursor.lastrowid
            sol = item["solution"]
            cursor.execute(
                """INSERT INTO solutions (problem_id, solution_text, source, resolved_by, confidence_score, root_cause, action_steps, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (problem_id, sol["solution_text"], sol["source"], sol["resolved_by"], sol["confidence_score"], sol["root_cause"], sol["action_steps"], item["resolved_at"])
            )
        conn.commit()
        print("Database seeding complete.")
    conn.close()

def reset_to_seed():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS solutions;")
    cursor.execute("DROP TABLE IF EXISTS problems;")
    cursor.execute("DROP TABLE IF EXISTS users;")
    cursor.execute("DROP TABLE IF EXISTS sql_query_logs;")
    conn.commit()
    conn.close()
    init_db()
    seed_db()
    log_query("RESET", "RESET DATABASE TO INITIAL BENCHMARK SEED", None, 0, 1.0)
    return {"status": "success", "message": "Database successfully reset with user ownership schema."}

def get_all_users() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users ORDER BY id ASC;")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def insert_user(username: str, full_name: str, role: str) -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()
    now_ts = get_now_ist()
    cursor.execute(
        """INSERT INTO users (username, full_name, role, created_at)
           VALUES (?, ?, ?, ?)""",
        (username.strip().lower(), full_name.strip(), role.strip(), now_ts)
    )
    user_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"id": user_id, "username": username, "full_name": full_name, "role": role, "created_at": now_ts}


def insert_problem(title: str, description: str, category: str, severity: str = "Medium", keywords: str = "", reported_by: str = "Akshay Kumar (Lead SRE)") -> Dict[str, Any]:
    t0 = time.time()
    conn = get_db_connection()
    cursor = conn.cursor()
    now_ts = get_now_ist()
    
    sql = """INSERT INTO problems (title, description, category, severity, keywords, reported_by, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?);"""
    params = (title.strip(), description.strip(), category.strip(), severity.strip(), keywords.strip(), reported_by.strip(), now_ts)
    
    cursor.execute(sql, params)
    problem_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    elapsed = (time.time() - t0) * 1000
    log_query("INSERT", sql, params, 1, elapsed)
    
    return get_problem(problem_id)

def get_problem(problem_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM problems WHERE id = ?;", (problem_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
    
    prob = dict(row)
    cursor.execute("SELECT * FROM solutions WHERE problem_id = ? ORDER BY id DESC;", (problem_id,))
    solutions = [dict(s) for s in cursor.fetchall()]
    prob["solutions"] = solutions
    conn.close()
    return prob

def get_all_problems(status: Optional[str] = None, category: Optional[str] = None) -> List[Dict[str, Any]]:
    t0 = time.time()
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
    SELECT p.*, COUNT(s.id) as solution_count
    FROM problems p
    LEFT JOIN solutions s ON p.id = s.problem_id
    WHERE 1=1
    """
    params = []
    if status:
        query += " AND p.status = ?"
        params.append(status)
    if category:
        query += " AND p.category = ?"
        params.append(category)
        
    query += " GROUP BY p.id ORDER BY p.id DESC;"
    
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    
    elapsed = (time.time() - t0) * 1000
    log_query("SELECT", query, params, len(rows), elapsed)
    return rows

def find_historical_solutions_by_sql(category: str, keywords: str, title: str) -> Dict[str, Any]:
    t0 = time.time()
    conn = get_db_connection()
    cursor = conn.cursor()
    
    tokens = [t.strip().lower() for t in (keywords + " " + title).replace(",", " ").split() if len(t.strip()) > 2]
    tokens = list(dict.fromkeys(tokens))[:5]
    
    sql = """
    SELECT 
        p.id AS problem_id,
        p.title,
        p.description,
        p.category,
        p.severity,
        p.keywords,
        p.reported_by,
        s.id AS solution_id,
        s.solution_text,
        s.source,
        s.resolved_by,
        s.confidence_score,
        s.root_cause,
        s.action_steps,
        s.created_at AS resolved_at
    FROM problems p
    JOIN solutions s ON p.id = s.problem_id
    WHERE p.status = 'RESOLVED'
      AND (
          p.category = ?
    """
    params = [category]
    
    for token in tokens:
        sql += " OR p.title LIKE ? OR p.description LIKE ? OR p.keywords LIKE ?"
        wildcard = f"%{token}%"
        params.extend([wildcard, wildcard, wildcard])
        
    sql += """)
    ORDER BY 
        CASE WHEN p.category = ? THEN 1 ELSE 2 END,
        s.confidence_score DESC
    LIMIT 5;
    """
    params.append(category)
    
    cursor.execute(sql, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    
    elapsed = (time.time() - t0) * 1000
    log_query("RETRIEVAL", sql, params, len(rows), elapsed)
    
    return {
        "sql_query": sql.strip(),
        "parameters": params,
        "execution_time_ms": round(elapsed, 2),
        "historical_matches": rows
    }

def insert_solution(
    problem_id: int,
    solution_text: str,
    source: str = "AI",
    resolved_by: str = "Akshay Kumar (Lead SRE)",
    confidence_score: float = 1.0,
    root_cause: str = "",
    action_steps: str = ""
) -> Dict[str, Any]:
    t0 = time.time()
    conn = get_db_connection()
    cursor = conn.cursor()
    now_ts = get_now_ist()
    
    insert_sql = """
    INSERT INTO solutions (problem_id, solution_text, source, resolved_by, confidence_score, root_cause, action_steps, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    """
    insert_params = (problem_id, solution_text.strip(), source, resolved_by.strip(), confidence_score, root_cause.strip(), action_steps.strip(), now_ts)
    cursor.execute(insert_sql, insert_params)
    solution_id = cursor.lastrowid
    
    update_sql = """
    UPDATE problems
    SET status = 'RESOLVED', resolved_at = ?
    WHERE id = ?;
    """
    cursor.execute(update_sql, (now_ts, problem_id))
    
    conn.commit()
    conn.close()
    
    elapsed = (time.time() - t0) * 1000
    log_query("INSERT", insert_sql, insert_params, 1, elapsed)
    log_query("UPDATE", update_sql, [now_ts, problem_id], 1, elapsed)
    
    return {
        "solution_id": solution_id,
        "problem_id": problem_id,
        "solution_text": solution_text,
        "source": source,
        "resolved_by": resolved_by,
        "confidence_score": confidence_score,
        "root_cause": root_cause,
        "action_steps": action_steps,
        "resolved_at": now_ts,
        "status": "RESOLVED"
    }

def get_stats() -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) as total FROM problems;")
    total_problems = cursor.fetchone()["total"]
    
    cursor.execute("SELECT COUNT(*) as resolved FROM problems WHERE status = 'RESOLVED';")
    resolved_problems = cursor.fetchone()["resolved"]
    
    cursor.execute("SELECT COUNT(*) as open_probs FROM problems WHERE status = 'OPEN';")
    open_problems = cursor.fetchone()["open_probs"]
    
    cursor.execute("SELECT COUNT(*) as total_sols FROM solutions;")
    total_solutions = cursor.fetchone()["total_sols"]
    
    cursor.execute("SELECT COUNT(*) as ai_sols FROM solutions WHERE source = 'AI';")
    ai_solutions = cursor.fetchone()["ai_sols"]
    
    cursor.execute("SELECT COUNT(*) as human_sols FROM solutions WHERE source = 'Human';")
    human_solutions = cursor.fetchone()["human_sols"]
    
    cursor.execute("SELECT category, COUNT(*) as count FROM problems GROUP BY category ORDER BY count DESC;")
    categories = [dict(c) for c in cursor.fetchall()]
    
    cursor.execute("SELECT * FROM sql_query_logs ORDER BY id DESC LIMIT 15;")
    recent_logs = [dict(l) for l in cursor.fetchall()]
    
    conn.close()
    
    resolution_rate = round((resolved_problems / total_problems * 100), 1) if total_problems > 0 else 0.0
    
    return {
        "total_problems": total_problems,
        "resolved_problems": resolved_problems,
        "open_problems": open_problems,
        "total_solutions": total_solutions,
        "ai_solutions": ai_solutions,
        "human_solutions": human_solutions,
        "resolution_rate": resolution_rate,
        "categories": categories,
        "recent_logs": recent_logs
    }

def execute_custom_query(sql_query: str) -> Dict[str, Any]:
    sql_clean = sql_query.strip()
    if not sql_clean.upper().startswith("SELECT"):
        return {"error": "Only SELECT statements are permitted in Database Explorer console."}
        
    t0 = time.time()
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(sql_clean)
        
        columns = [d[0] for d in cursor.description] if cursor.description else []
        rows = [dict(zip(columns, r)) for r in cursor.fetchall()]
        conn.close()
        
        elapsed = (time.time() - t0) * 1000
        log_query("EXPLORER", sql_clean, None, len(rows), elapsed)
        
        return {
            "columns": columns,
            "rows": rows,
            "count": len(rows),
            "execution_time_ms": round(elapsed, 2)
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    init_db()
    seed_db()
