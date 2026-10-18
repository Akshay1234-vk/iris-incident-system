"""
IRIS (Intelligent Resolution Incident System)
FastAPI Backend Server & REST API
Features:
- Database-Augmented AI Engine (Google Gemini official SDK + FTS5 BM25 SQL Context)
- User Authentication & Operator Ownership (reported_by, resolved_by)
- Live SQL Audit & Execution Explorer
- Dynamic AI Health Diagnostics & Connection Verification
"""

import os
import time
import re
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query, Header
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import database
import ai_engine

@asynccontextmanager
async def lifespan(app: FastAPI):
    database.init_db()
    database.seed_db()
    print("IRIS Database initialized and ready on startup.")
    yield

app = FastAPI(
    title="IRIS - Intelligent Resolution Incident System",
    description="Database-First Organizational Incident & Decision Intelligence Platform",
    version="2.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Request Models
class ProblemCreate(BaseModel):
    title: str
    description: str
    category: str
    severity: Optional[str] = "Medium"
    keywords: Optional[str] = ""
    reported_by: Optional[str] = "Akshay Kumar (Lead SRE)"

class SolutionResolve(BaseModel):
    solution_text: str
    source: Optional[str] = "AI"
    resolved_by: Optional[str] = "Akshay Kumar (Lead SRE)"
    confidence_score: Optional[float] = 0.95
    root_cause: Optional[str] = ""
    action_steps: Optional[str] = ""

class AnalyzeRequest(BaseModel):
    api_key: Optional[str] = None

class TestConnectionRequest(BaseModel):
    api_key: Optional[str] = None
    model: Optional[str] = None

class UserCreate(BaseModel):
    username: Optional[str] = None
    full_name: str
    role: str

class ApiKeyUpdate(BaseModel):
    api_key: str

class CustomQueryRequest(BaseModel):
    sql_query: str

class ClassifyRequest(BaseModel):
    title: str
    api_key: Optional[str] = None

# API Routes
@app.get("/api/system/status")
def get_system_status():
    """Retrieve active AI engine status, model info, and configuration."""
    ai_status = ai_engine.get_ai_status()
    db_stats = database.get_stats()
    return {
        "ai_engine": ai_status,
        "database": {
            "total_incidents": db_stats["total_problems"],
            "resolved_incidents": db_stats["resolved_problems"],
            "resolution_rate": db_stats["resolution_rate"]
        }
    }

@app.post("/api/system/api-key")
def update_api_key(payload: ApiKeyUpdate):
    """Save or update Google Gemini API key dynamically."""
    success = ai_engine.set_gemini_api_key(payload.api_key)
    if not success:
        raise HTTPException(status_code=400, detail="Invalid API key provided.")
    return {
        "status": "success",
        "message": "Gemini API key successfully saved and active.",
        "ai_status": ai_engine.get_ai_status()
    }

@app.delete("/api/system/api-key")
def delete_api_key():
    """Clear configured Google Gemini API key."""
    ai_engine.clear_gemini_api_key()
    return {
        "status": "success",
        "message": "Gemini API key cleared.",
        "ai_status": ai_engine.get_ai_status()
    }

@app.post("/api/system/test-connection")
def test_gemini_connection(payload: Optional[TestConnectionRequest] = None):
    """
    Test connectivity to Google Gemini via a live API probe call.
    Accepts optional custom key and model override to test without persisting.
    """
    custom_key = payload.api_key if payload else None
    model = payload.model if payload else None
    result = ai_engine.verify_gemini_connection(api_key=custom_key, model_name=model)
    return result

@app.get("/api/users")
def list_users():
    """Retrieve list of all active operators and engineers."""
    return database.get_all_users()

@app.post("/api/users")
def register_user(payload: UserCreate):
    """Register a new user / operator into the organizational directory."""
    if not payload.full_name or not payload.full_name.strip():
        raise HTTPException(status_code=400, detail="Full name is required.")
    if not payload.role or not payload.role.strip():
        raise HTTPException(status_code=400, detail="Role is required.")

    uname = (payload.username or "").strip().lower()
    if not uname:
        uname = re.sub(r'[^a-z0-9]+', '_', payload.full_name.lower()).strip('_')
        if not uname:
            uname = "operator"

    try:
        new_user = database.insert_user(
            username=uname,
            full_name=payload.full_name.strip(),
            role=payload.role.strip()
        )
        return new_user
    except ValueError as ve:
        err_msg = str(ve)
        if "already exists" in err_msg.lower():
            raise HTTPException(status_code=409, detail=err_msg)
        raise HTTPException(status_code=400, detail=err_msg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create user: {str(e)}")

@app.get("/api/stats")
def get_system_stats():
    """Retrieve database metrics, resolution rates, and query audit logs."""
    return database.get_stats()

@app.get("/api/problems")
def list_problems(status: Optional[str] = None, category: Optional[str] = None):
    """List all problems with optional status and category filters."""
    return database.get_all_problems(status=status, category=category)

@app.get("/api/problems/{problem_id}")
def get_problem_details(problem_id: int):
    """Retrieve details for a specific problem, including its solutions."""
    prob = database.get_problem(problem_id)
    if not prob:
        raise HTTPException(status_code=404, detail=f"Problem with ID {problem_id} not found.")
    return prob

@app.post("/api/problems")
def create_problem(
    payload: ProblemCreate,
    x_gemini_api_key: Optional[str] = Header(None, alias="X-Gemini-API-Key")
):
    """
    Promptly insert a new problem into the relational database with operator audit tracking.
    Immediately returns incident ID and persistence duration (< 50ms) without blocking on Gemini.
    Promptly triggers background AI analysis.
    """
    if not payload.title or not payload.title.strip() or not payload.description or not payload.description.strip() or not payload.category or not payload.category.strip():
        raise HTTPException(status_code=400, detail="Title, description, and category are required.")
    
    t0 = time.time()
    created = database.insert_problem(
        title=payload.title.strip(),
        description=payload.description.strip(),
        category=payload.category.strip(),
        severity=payload.severity or "Medium",
        keywords=payload.keywords or "",
        reported_by=payload.reported_by or "Akshay Kumar (Lead SRE)"
    )
    elapsed_ms = round((time.time() - t0) * 1000, 2)
    created["persisted_in_ms"] = elapsed_ms
    created["analysis_status"] = "PENDING"

    # Kick off asynchronous background analysis task
    ai_engine.start_background_analysis(
        problem_id=created["id"],
        title=created["title"],
        description=created["description"],
        category=created["category"],
        severity=created["severity"],
        keywords=created.get("keywords") or "",
        reported_by=created.get("reported_by") or "Akshay Kumar (Lead SRE)",
        custom_api_key=x_gemini_api_key
    )
    return created

@app.post("/api/problems/{problem_id}/analyze")
def analyze_problem(
    problem_id: int,
    payload: Optional[AnalyzeRequest] = None,
    sync: bool = False,
    x_gemini_api_key: Optional[str] = Header(None, alias="X-Gemini-API-Key")
):
    """
    Run or queue AI analysis on a logged problem.
    If sync=True, waits and returns complete analysis synchronously.
    If sync=False (default), initiates non-blocking background task and returns task status immediately.
    """
    prob = database.get_problem(problem_id)
    if not prob:
        raise HTTPException(status_code=404, detail=f"Problem with ID {problem_id} not found.")
    
    custom_key = (payload.api_key if payload else None) or x_gemini_api_key

    if sync:
        analysis = ai_engine.analyze_incident_and_recommend(
            problem_id=prob["id"],
            title=prob["title"],
            description=prob["description"],
            category=prob["category"],
            severity=prob["severity"],
            keywords=prob["keywords"] or "",
            reported_by=prob.get("reported_by", "Anonymous Engineer"),
            custom_api_key=custom_key
        )
        return analysis

    task = ai_engine.start_background_analysis(
        problem_id=prob["id"],
        title=prob["title"],
        description=prob["description"],
        category=prob["category"],
        severity=prob["severity"],
        keywords=prob["keywords"] or "",
        reported_by=prob.get("reported_by", "Anonymous Engineer"),
        custom_api_key=custom_key
    )
    return task

@app.get("/api/problems/{problem_id}/analysis")
def get_problem_analysis(problem_id: int):
    """
    Retrieve current background AI analysis status and results for an incident.
    Returns status: PENDING | PROCESSING | COMPLETED | FAILED
    """
    task = ai_engine.get_analysis_status(problem_id)
    if task:
        return task

    prob = database.get_problem(problem_id)
    if not prob:
        raise HTTPException(status_code=404, detail=f"Problem with ID {problem_id} not found.")

    task = ai_engine.start_background_analysis(
        problem_id=prob["id"],
        title=prob["title"],
        description=prob["description"],
        category=prob["category"],
        severity=prob["severity"],
        keywords=prob["keywords"] or "",
        reported_by=prob.get("reported_by", "Anonymous Engineer")
    )
    return task

@app.post("/api/problems/{problem_id}/resolve")
def resolve_problem(problem_id: int, payload: SolutionResolve):
    """
    Closed-Loop Knowledge Ingestion:
    Inserts final accepted solution into solutions table and marks problem as RESOLVED.
    """
    prob = database.get_problem(problem_id)
    if not prob:
        raise HTTPException(status_code=404, detail=f"Problem with ID {problem_id} not found.")
    
    if not payload.solution_text or not payload.solution_text.strip():
        raise HTTPException(status_code=400, detail="Solution text cannot be empty.")
    
    result = database.insert_solution(
        problem_id=problem_id,
        solution_text=payload.solution_text.strip(),
        source=payload.source or "Human",
        resolved_by=payload.resolved_by or "Akshay Kumar (Lead SRE)",
        confidence_score=payload.confidence_score or 1.0,
        root_cause=payload.root_cause or "",
        action_steps=payload.action_steps or ""
    )
    return result

@app.post("/api/auto-classify")
def auto_classify_incident(
    payload: ClassifyRequest,
    x_gemini_api_key: Optional[str] = Header(None, alias="X-Gemini-API-Key")
):
    """Real-Time AI Auto-Classifier endpoint for incident titles."""
    custom_key = payload.api_key or x_gemini_api_key
    return ai_engine.classify_incident_title(payload.title, custom_api_key=custom_key)

@app.get("/api/explorer/tables")
def get_database_tables():
    """Retrieve raw rows from all main database tables for database exploration."""
    conn = database.get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM problems ORDER BY id DESC;")
    problems = [dict(r) for r in cursor.fetchall()]
    
    cursor.execute("SELECT s.*, p.title as problem_title FROM solutions s JOIN problems p ON s.problem_id = p.id ORDER BY s.id DESC;")
    solutions = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM users ORDER BY id ASC;")
    users = [dict(r) for r in cursor.fetchall()]
    
    cursor.execute("SELECT * FROM sql_query_logs ORDER BY id DESC LIMIT 50;")
    logs = [dict(r) for r in cursor.fetchall()]
    
    conn.close()
    
    return {
        "problems": problems,
        "solutions": solutions,
        "users": users,
        "logs": logs
    }

@app.post("/api/explorer/query")
def run_sql_query(payload: CustomQueryRequest):
    """Execute custom SELECT queries on the database (useful for professors during review)."""
    return database.execute_custom_query(payload.sql_query)

@app.post("/api/reset-seed")
def reset_database():
    """Reset database to benchmark seed records."""
    return database.reset_to_seed()

# Serve static frontend files
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
