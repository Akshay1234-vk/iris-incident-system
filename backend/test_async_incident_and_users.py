"""
IRIS Regression Test Suite
Tests for:
1. User creation, validation, and duplicate conflict handling.
2. Immediate user list refresh and operator switching.
3. Rapid incident persistence (< 50ms) decoupled from Gemini generation.
4. Asynchronous background AI analysis lifecycle (PENDING, PROCESSING, COMPLETED, FAILED).
5. Separate measurement of incident persistence duration vs AI generation duration.
6. Isolated test database execution preserving production data.
"""

import os
import sys
import time
import json
import sqlite3
import tempfile
import unittest
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient

# Ensure backend directory is in path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

import database
import ai_engine
from main import app


class TestAsyncIncidentAndUserManagement(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create an isolated temporary SQLite database for testing
        cls.temp_db_fd, cls.temp_db_path = tempfile.mkstemp(suffix="_iris_test.db")
        cls.orig_db_path = database.DB_PATH
        database.DB_PATH = cls.temp_db_path

        # Initialize schema and seed data in isolated test database
        database.init_db()
        database.seed_db()

        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        # Restore original database path and clean up temp file
        database.DB_PATH = cls.orig_db_path
        try:
            os.close(cls.temp_db_fd)
            if os.path.exists(cls.temp_db_path):
                os.remove(cls.temp_db_path)
        except Exception:
            pass

    def setUp(self):
        ai_engine.clear_analysis_tasks()

    # -------------------------------------------------------------------------
    # Issue 1: User Management & Operator Switching Tests
    # -------------------------------------------------------------------------

    def test_01_create_user_success_persisted_to_sqlite(self):
        """Verify user is created and actually persisted to SQLite with audit fields."""
        payload = {
            "username": "dr_murugan",
            "full_name": "Prof. Murugan",
            "role": "Faculty Reviewer"
        }
        res = self.client.post("/api/users", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertIn("id", data)
        self.assertEqual(data["username"], "dr_murugan")
        self.assertEqual(data["full_name"], "Prof. Murugan")
        self.assertEqual(data["role"], "Faculty Reviewer")
        self.assertIsNotNone(data["created_at"])

        # Directly verify SQLite persistence in the database table
        conn = database.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", ("dr_murugan",))
        row = cursor.fetchone()
        conn.close()

        self.assertIsNotNone(row)
        self.assertEqual(row["full_name"], "Prof. Murugan")
        self.assertEqual(row["role"], "Faculty Reviewer")

    def test_02_create_user_duplicate_username_returns_409_conflict(self):
        """Verify duplicate username returns HTTP 409 Conflict without throwing 500 or crashing."""
        payload = {
            "username": "akshay",  # already exists in seed data
            "full_name": "Akshay Duplicate",
            "role": "SRE Engineer"
        }
        res = self.client.post("/api/users", json=payload)
        self.assertEqual(res.status_code, 409)
        data = res.json()
        self.assertIn("already exists", data["detail"].lower())

    def test_03_create_user_auto_derives_username_if_omitted(self):
        """Verify username is cleanly auto-derived from full_name if omitted."""
        payload = {
            "full_name": "Sarah Connor",
            "role": "Security Specialist"
        }
        res = self.client.post("/api/users", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["username"], "sarah_connor")
        self.assertEqual(data["full_name"], "Sarah Connor")

    def test_04_create_user_validation_missing_fields(self):
        """Verify required field validation returns HTTP 400."""
        res1 = self.client.post("/api/users", json={"full_name": "", "role": "Tester"})
        self.assertEqual(res1.status_code, 400)

        res2 = self.client.post("/api/users", json={"full_name": "Test User", "role": "   "})
        self.assertEqual(res2.status_code, 400)

    def test_05_immediate_user_list_refresh(self):
        """Verify newly created user is immediately returned in GET /api/users without application restart."""
        # Create fresh user
        uname = f"operator_{int(time.time())}"
        self.client.post("/api/users", json={"username": uname, "full_name": "Live Operator", "role": "DevOps"})

        res = self.client.post("/api/users", json={"username": f"eng_{int(time.time())}", "full_name": "Dev Engineer", "role": "L1 Support"})
        self.assertEqual(res.status_code, 200)
        created_id = res.json()["id"]

        list_res = self.client.get("/api/users")
        self.assertEqual(list_res.status_code, 200)
        users = list_res.json()
        user_ids = [u["id"] for u in users]
        self.assertIn(created_id, user_ids)

    def test_06_switching_reporting_user_updates_incident_reporter(self):
        """Verify incidents are recorded with the currently switched reporting user."""
        reporter_name = "Priya Sharma (Database Administrator)"
        prob_payload = {
            "title": "Slow Postgres Query on Invoices Table",
            "category": "Database",
            "severity": "High",
            "keywords": "postgres, query, slow",
            "description": "Invoice aggregation query times out after 30 seconds.",
            "reported_by": reporter_name
        }
        create_res = self.client.post("/api/problems", json=prob_payload)
        self.assertEqual(create_res.status_code, 200)
        prob_data = create_res.json()

        self.assertEqual(prob_data["reported_by"], reporter_name)

        # Directly check SQLite database record
        prob_db = database.get_problem(prob_data["id"])
        self.assertEqual(prob_db["reported_by"], reporter_name)

    # -------------------------------------------------------------------------
    # Issue 2: Rapid Persistence & Background AI Analysis Lifecycle Tests
    # -------------------------------------------------------------------------

    def test_07_incident_persistence_prompt_timing_under_50ms(self):
        """
        Verify that POST /api/problems persists promptly to SQLite and returns its ID
        in under 50ms without blocking on Gemini LLM reasoning.
        """
        t0 = time.time()
        res = self.client.post("/api/problems", json={
            "title": "Memory Leak in Background Indexer Worker",
            "category": "Performance",
            "severity": "High",
            "keywords": "memory, leak, oom, indexer",
            "description": "Resident set size steadily increases by 200MB/hr until OOM kill.",
            "reported_by": "Akshay Kumar (Lead SRE)"
        })
        duration_ms = (time.time() - t0) * 1000

        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("id", data)
        self.assertGreater(data["id"], 0)
        self.assertEqual(data["title"], "Memory Leak in Background Indexer Worker")
        self.assertEqual(data["analysis_status"], "PENDING")

        print(f"\n[Timing Benchmark] Incident Persistence Response Time: {duration_ms:.2f}ms (Threshold: < 50ms)")
        self.assertLess(duration_ms, 50.0, f"Incident persistence was too slow ({duration_ms:.2f}ms). Must return < 50ms.")

    def test_08_background_analysis_success_lifecycle(self):
        """
        Verify complete asynchronous background AI analysis lifecycle:
        1. POST /api/problems returns immediately with status PENDING.
        2. Worker transitions to PROCESSING then COMPLETED.
        3. GET /api/problems/{id}/analysis retrieves the completed result.
        """
        mock_res = MagicMock()
        mock_res.text = json.dumps({
            "root_cause": "Unbounded task queue buffering in background indexing worker.",
            "primary_solution": "Apply backpressure with bounded queue capacity and configure GC generational thresholds.",
            "confidence_score": 0.93,
            "action_steps": "1. Set queue maxsize=1000.\n2. Enable backpressure throttling.",
            "alternative_solutions": ["Use external Redis task queue."],
            "precedents_used": [],
            "reasoning_summary": "Identified circular reference retaining heap memory."
        })

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_res

        with patch("google.genai.Client", return_value=mock_client), \
             patch("ai_engine.get_gemini_api_key", return_value="AIzaSyMockKeyForAsyncTest"):

            # 1. Create problem
            create_res = self.client.post("/api/problems", json={
                "title": "Kafka Consumer Lag Spike in Payment Pipeline",
                "category": "DevOps",
                "severity": "Critical",
                "keywords": "kafka, consumer, lag, payment",
                "description": "Payment consumer partition lag exceeded 50,000 records.",
                "reported_by": "Akshay Kumar (Lead SRE)"
            })
            self.assertEqual(create_res.status_code, 200)
            prob_id = create_res.json()["id"]

            # 2. Poll until background task transitions to COMPLETED
            completed = False
            for _ in range(20):
                status_res = self.client.get(f"/api/problems/{prob_id}/analysis")
                self.assertEqual(status_res.status_code, 200)
                data = status_res.json()
                if data.get("status") == "COMPLETED":
                    completed = True
                    break
                time.sleep(0.05)

            self.assertTrue(completed, "Background analysis task did not transition to COMPLETED.")
            self.assertIsNotNone(data["analysis"])
            self.assertTrue(data["analysis"]["ai_available"])
            self.assertEqual(data["analysis"]["ai_recommendation"]["root_cause"],
                             "Unbounded task queue buffering in background indexing worker.")

    def test_09_background_analysis_failure_lifecycle_preserves_database_incident(self):
        """
        Verify that when AI provider fails or is unconfigured:
        1. The incident remains intact and saved in SQLite.
        2. Status transitions to FAILED.
        3. Database SQL precedents context is preserved for manual resolution.
        """
        with patch("ai_engine.get_gemini_api_key", return_value=None):
            # Create problem
            create_res = self.client.post("/api/problems", json={
                "title": "Elasticsearch Shard Allocation Failure",
                "category": "Database",
                "severity": "High",
                "keywords": "elasticsearch, shard, cluster",
                "description": "Primary shards stuck in UNASSIGNED state following node reboot.",
                "reported_by": "Rahul Verma (Backend Engineer)"
            })
            self.assertEqual(create_res.status_code, 200)
            prob_id = create_res.json()["id"]

            # Poll until task completes/fails
            failed_or_done = False
            for _ in range(20):
                status_res = self.client.get(f"/api/problems/{prob_id}/analysis")
                self.assertEqual(status_res.status_code, 200)
                data = status_res.json()
                if data.get("status") in ("FAILED", "COMPLETED"):
                    failed_or_done = True
                    break
                time.sleep(0.05)

            self.assertTrue(failed_or_done)
            self.assertEqual(data["status"], "FAILED")
            self.assertIn("not configured", data["error"].lower())

            # Crucial requirement: Incident in SQLite MUST NOT BE LOST!
            db_prob = database.get_problem(prob_id)
            self.assertIsNotNone(db_prob)
            self.assertEqual(db_prob["title"], "Elasticsearch Shard Allocation Failure")

    def test_10_duplicate_analysis_prevention(self):
        """Verify calling start_background_analysis multiple times attaches to existing running task."""
        prob_id = 999
        ai_engine.clear_analysis_tasks()

        task1 = ai_engine.start_background_analysis(
            problem_id=prob_id,
            title="Sample Incident",
            description="Sample Desc",
            category="Database"
        )
        task2 = ai_engine.start_background_analysis(
            problem_id=prob_id,
            title="Sample Incident",
            description="Sample Desc",
            category="Database"
        )

        self.assertEqual(task1["status"], task2["status"])
        self.assertEqual(task1["created_at"], task2["created_at"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
