"""
IRIS (Intelligent Resolution Incident System)
FastAPI Backend Server & REST API
"""

import os
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import database
import ai_engine

app = FastAPI(
    title="IRIS - Intelligent Resolution Incident System",
    description="Database-First Organizational Incident & Decision Intelligence Platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize and seed database on startup
@app.on_event("startup")
def startup_event():
    database.init_db()
    database.seed_db()
    print("IRIS Database initialized and ready on startup.")

# Pydantic Request Models
class ProblemCreate(BaseModel):
    title: str
    description: str
    category: str
    severity: Optional[str] = "Medium"
    keywords: Optional[str] = ""

class SolutionResolve(BaseModel):
    solution_text: str
    source: Optional[str] = "AI"
    confidence_score: Optional[float] = 0.95
    root_cause: Optional[str] = ""
    action_steps: Optional[str] = ""

class CustomQueryRequest(BaseModel):
    sql_query: str

# API Routes
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
def create_problem(payload: ProblemCreate):
    """Insert a new problem into the relational database."""
    if not payload.title or not payload.description or not payload.category:
        raise HTTPException(status_code=400, detail="Title, description, and category are required.")
    
    created = database.insert_problem(
        title=payload.title,
        description=payload.description,
        category=payload.category,
        severity=payload.severity or "Medium",
        keywords=payload.keywords or ""
    )
    return created

@app.post("/api/problems/{problem_id}/analyze")
def analyze_problem(problem_id: int):
    """
    Run the IRIS AI Engine on a logged problem.
    Executes SQL similarity query against historical solutions and generates recommendations.
    """
    prob = database.get_problem(problem_id)
    if not prob:
        raise HTTPException(status_code=404, detail=f"Problem with ID {problem_id} not found.")
    
    analysis = ai_engine.analyze_incident_and_recommend(
        problem_id=prob["id"],
        title=prob["title"],
        description=prob["description"],
        category=prob["category"],
        severity=prob["severity"],
        keywords=prob["keywords"] or ""
    )
    return analysis

@app.post("/api/problems/{problem_id}/resolve")
def resolve_problem(problem_id: int, payload: SolutionResolve):
    """
    Closed-Loop Knowledge Ingestion:
    Inserts final accepted solution into solutions table and marks problem as RESOLVED.
    """
    prob = database.get_problem(problem_id)
    if not prob:
        raise HTTPException(status_code=404, detail=f"Problem with ID {problem_id} not found.")
    
    result = database.insert_solution(
        problem_id=problem_id,
        solution_text=payload.solution_text,
        source=payload.source or "Human",
        confidence_score=payload.confidence_score or 1.0,
        root_cause=payload.root_cause or "",
        action_steps=payload.action_steps or ""
    )
    return result

@app.get("/api/explorer/tables")
def get_database_tables():
    """Retrieve raw rows from all main database tables for database exploration."""
    conn = database.get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM problems ORDER BY id DESC;")
    problems = [dict(r) for r in cursor.fetchall()]
    
    cursor.execute("SELECT s.*, p.title as problem_title FROM solutions s JOIN problems p ON s.problem_id = p.id ORDER BY s.id DESC;")
    solutions = [dict(r) for r in cursor.fetchall()]
    
    cursor.execute("SELECT * FROM sql_query_logs ORDER BY id DESC LIMIT 50;")
    logs = [dict(r) for r in cursor.fetchall()]
    
    conn.close()
    
    return {
        "problems": problems,
        "solutions": solutions,
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


class ClassifyRequest(BaseModel):
    title: str

@app.post("/api/auto-classify")
def auto_classify_incident(payload: ClassifyRequest):
    """Real-Time AI Auto-Classifier endpoint for incident titles."""
    return ai_engine.classify_incident_title(payload.title)

# Serve static frontend files
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
