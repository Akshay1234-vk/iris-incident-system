"""
IRIS (Intelligent Resolution Incident System)
AI Engine & LLM Integration Verification Suite

Covers:
1. Scenario A: Incident with historical database matches (Context Grounding & Citation)
2. Scenario B: Novel incident with 0 historical database matches (First-Principles Reasoning)
3. Unconfigured / Missing API Key (Verifies NO fake fallback or simulated responses)
4. AI Provider Exception / Network Timeout Handling (Honest failure reporting)
5. Malformed LLM Output Handling
6. Real-Time Auto-Classification Verification (Real AI vs Unconfigured state)
7. Manual Resolution Workflow (Human engineer path when AI is offline)
8. Credential Precedence Hierarchy (Request key > Runtime key > .env > os.environ)
9. AI Health State Machine (NOT_CONFIGURED, CONFIGURED_UNVERIFIED, VERIFIED_LIVE, PROVIDER_ERROR)
10. Live Connection Probe Endpoint (/api/system/test-connection)
11. Safe Key Masking (Zero credential leaks in API responses or logs)
12. Key Deletion / Disconnect Lifecycle
"""

import os
import sys
import json
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import database
import ai_engine
from main import app
from fastapi.testclient import TestClient

class TestAIEngine(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        database.init_db()
        database.reset_to_seed()
        cls.client = TestClient(app)

    def setUp(self):
        # Reset runtime keys before each test
        ai_engine.clear_gemini_api_key()

    def tearDown(self):
        ai_engine.clear_gemini_api_key()

    def test_01_missing_api_key_reports_honest_status_no_fake_ai(self):
        """Verify that when no API key is provided, the engine reports ai_available: False with NO fake AI output."""
        with patch.dict(os.environ, {}, clear=True):
            result = ai_engine.analyze_incident_and_recommend(
                problem_id=1,
                title="Memory leak in worker processes",
                description="Worker memory climbs indefinitely until OOM killer intervenes.",
                category="Performance",
                severity="High",
                keywords="memory leak, oom, heap, worker"
            )

            self.assertFalse(result["ai_available"])
            self.assertIsNone(result["ai_recommendation"])
            self.assertEqual(result["status"], "NOT_CONFIGURED")
            self.assertIn("error", result)
            self.assertIn("GEMINI_API_KEY", result["error"])
            self.assertIn("sql_context", result)
            self.assertIsInstance(result["historical_matches"], list)

    def test_02_gemini_call_with_historical_matches(self):
        """Scenario A: Problem with historical matches passed to Gemini, resulting in grounded recommendation."""
        mock_gemini_response = MagicMock()
        mock_gemini_response.text = json.dumps({
            "root_cause": "Full table scan on the users table due to missing index on status column under high filter load.",
            "primary_solution": "Execute CREATE INDEX idx_users_status ON users(status) and invalidate stale query cache (Referenced from Incident #1).",
            "action_steps": "1. Run CREATE INDEX idx_users_status ON users(status);\n2. Check EXPLAIN ANALYZE plan.\n3. Verify p99 latency drops below 50ms.",
            "alternative_solutions": [
                "Alternative A: Introduce read replica for read-heavy filter queries.",
                "Alternative B: Apply temporary rate limiting on filter endpoint."
            ],
            "confidence_score": 0.94,
            "precedents_used": [
                {
                    "problem_id": 1,
                    "title": "Slow API Response on User Profile Page",
                    "relevance": "Direct match on missing index root cause and query latency profile."
                }
            ],
            "reasoning_summary": "Synthesized from historical Incident #1 which resolved a identical table scan failure with indexing.",
            "is_novel": False
        })

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_gemini_response

        with patch("google.genai.Client", return_value=mock_client):
            result = ai_engine.analyze_incident_and_recommend(
                problem_id=10,
                title="Slow API Response on User Profile Page",
                description="Profile page takes 6 seconds to query users table with missing index.",
                category="Performance",
                severity="High",
                keywords="api, latency, slow query, missing index, performance",
                custom_api_key="AIzaSyTestKeyScenarioA1234"
            )

            self.assertTrue(result["ai_available"])
            rec = result["ai_recommendation"]
            self.assertIsNotNone(rec)
            self.assertEqual(rec["confidence_score"], 0.94)
            self.assertEqual(rec["confidence_percentage"], "94%")
            self.assertIn("Incident #1", rec["primary_solution"])
            self.assertFalse(rec["is_novel"])
            self.assertEqual(len(rec["precedents_used"]), 1)
            self.assertEqual(rec["precedents_used"][0]["problem_id"], 1)

            # Verify prompt passed to Gemini actually contained historical context
            call_kwargs = mock_client.models.generate_content.call_args.kwargs
            contents = call_kwargs.get("contents", "")
            self.assertIn("HISTORICAL DATABASE PRECEDENTS RETRIEVED VIA SQL", contents)
            self.assertIn("Slow API Response", contents)

    def test_03_gemini_call_novel_incident_zero_historical_matches(self):
        """Scenario B: Completely new incident with 0 historical matches. Gemini solves from first principles."""
        mock_gemini_response = MagicMock()
        mock_gemini_response.text = json.dumps({
            "root_cause": "Dilution refrigerator thermal link decoupling caused cryogenic temperature excursion above superconducting critical threshold.",
            "primary_solution": "Cycle helium compressor bypass valve, inspect vacuum insulation gauge, and verify automated thermal PID loop.",
            "action_steps": "1. Isolate fridge control electronics.\n2. Verify 4K stage pressure.\n3. Re-engage closed-loop thermal regulation.",
            "alternative_solutions": [
                "Alternative A: Switch to secondary backup compressor.",
                "Alternative B: Perform controlled quantum processor thermal idle cycle."
            ],
            "confidence_score": 0.82,
            "precedents_used": [],
            "reasoning_summary": "First-principles cryogenic control diagnosis; no matching historical incident exists in organizational store.",
            "is_novel": True
        })

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_gemini_response

        with patch("google.genai.Client", return_value=mock_client):
            result = ai_engine.analyze_incident_and_recommend(
                problem_id=11,
                title="Cryostat Dilution Refrigerator Thermal Coupling Failure",
                description="Sub-Kelvin thermal sensor reads 4.2K indicating total loss of superconducting base temperature.",
                category="QuantumCryogenics",
                severity="Critical",
                keywords="subkelvin, cryostat, dilution refrigerator, thermal coupling",
                custom_api_key="AIzaSyTestKeyScenarioB5678"
            )

            self.assertTrue(result["ai_available"])
            rec = result["ai_recommendation"]
            self.assertTrue(rec["is_novel"])
            self.assertEqual(rec["confidence_score"], 0.82)
            self.assertEqual(len(rec["precedents_used"]), 0)
            self.assertIn("First-principles", rec["reasoning_summary"])

            # Verify that prompt sent to Gemini explicitly stated 0 historical records
            call_kwargs = mock_client.models.generate_content.call_args.kwargs
            contents = call_kwargs.get("contents", "")
            self.assertIn("HISTORICAL DATABASE PRECEDENTS RETRIEVED VIA SQL (0 records)", contents)

    def test_04_gemini_api_provider_exception_returns_honest_error(self):
        """Verify that when Gemini API call raises an exception, it reports the error honestly and does NOT use fake fallbacks."""
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = Exception("ResourceExhausted: 429 Resource has been exhausted (e.g. check quota).")

        with patch("google.genai.Client", return_value=mock_client):
            result = ai_engine.analyze_incident_and_recommend(
                problem_id=12,
                title="Database Deadlock on Settlement",
                description="Concurrent settlement transactions blocked on lock table.",
                category="Database",
                severity="Critical",
                keywords="deadlock, settlement, transaction",
                custom_api_key="AIzaSyTestKeyException1234"
            )

            self.assertFalse(result["ai_available"])
            self.assertIsNone(result["ai_recommendation"])
            self.assertEqual(result["status"], "PROVIDER_ERROR")
            self.assertIn("error", result)
            self.assertIn("ResourceExhausted", result["error"])
            # Historical context should still be preserved
            self.assertGreater(result["sql_context"]["historical_records_retrieved"], 0)

    def test_05_malformed_llm_json_response_handled_gracefully(self):
        """Verify that malformed / non-JSON LLM responses are handled gracefully without application crash."""
        mock_gemini_response = MagicMock()
        mock_gemini_response.text = "This is not valid JSON string from LLM"

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_gemini_response

        with patch("google.genai.Client", return_value=mock_client):
            result = ai_engine.analyze_incident_and_recommend(
                problem_id=13,
                title="Corrupted session cache",
                description="Redis cache deserialization failure.",
                category="Authentication",
                severity="High",
                keywords="redis, cache, serialization",
                custom_api_key="AIzaSyTestKeyMalformed1234"
            )

            self.assertFalse(result["ai_available"])
            self.assertIsNone(result["ai_recommendation"])
            self.assertIn("error", result)

    def test_06_auto_classify_without_api_key_reports_unconfigured(self):
        """Verify auto-classify without an API key does NOT guess or fake classifications."""
        with patch.dict(os.environ, {}, clear=True):
            res = ai_engine.classify_incident_title("Deadlock on user account transfer")
            self.assertFalse(res["ai_available"])
            self.assertIsNone(res["category"])

    def test_07_auto_classify_with_gemini(self):
        """Verify auto-classify with Gemini calls LLM and returns structured classification."""
        mock_res = MagicMock()
        mock_res.text = json.dumps({
            "category": "Database",
            "severity": "Critical",
            "keywords": "deadlock, transactions, locks, sql",
            "suggested_description": "Deadlock detected during concurrent balance updates on user accounts."
        })
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_res

        with patch("google.genai.Client", return_value=mock_client):
            res = ai_engine.classify_incident_title("Deadlock on user account transfer", custom_api_key="AIzaSyTestClassify1234")
            self.assertTrue(res["ai_available"])
            self.assertEqual(res["category"], "Database")
            self.assertEqual(res["severity"], "Critical")
            self.assertIn("deadlock", res["keywords"])

    def test_08_manual_solution_resolution_workflow(self):
        """Verify manual resolution workflow when AI is offline or user provides custom solution."""
        # Insert a new problem
        prob = database.insert_problem(
            title="Kubernetes Ingress Gateway 502 Bad Gateway",
            description="NGINX Ingress returns 502 Bad Gateway during pod rolling update.",
            category="DevOps",
            severity="High",
            keywords="k8s, ingress, nginx, 502, rolling update",
            reported_by="SRE On-Call Engineer"
        )
        self.assertEqual(prob["status"], "OPEN")

        # Resolve manually
        sol = database.insert_solution(
            problem_id=prob["id"],
            solution_text="Added preStop lifecycle sleep 5 hook to give endpoints controller time to deregister pod from kube-proxy.",
            source="Human",
            resolved_by="SRE On-Call Engineer",
            confidence_score=1.0,
            root_cause="Kubernetes terminated pod before NGINX ingress updated upstream routing table.",
            action_steps="1. Update deployment yaml with lifecycle preStop.\n2. Apply changes.\n3. Perform rolling restart to verify zero 502s."
        )

        self.assertEqual(sol["status"], "RESOLVED")
        self.assertEqual(sol["source"], "Human")

        # Verify problem is now resolved
        resolved_prob = database.get_problem(prob["id"])
        self.assertEqual(resolved_prob["status"], "RESOLVED")
        self.assertEqual(len(resolved_prob["solutions"]), 1)

    def test_09_credential_precedence_hierarchy(self):
        """Verify strict priority ordering: Request Custom Key > Runtime In-Memory Key > os.environ."""
        with patch.dict(os.environ, {"GEMINI_API_KEY": "env_key_level_3"}, clear=True):
            # Level 3: os.environ
            self.assertEqual(ai_engine.get_gemini_api_key(), "env_key_level_3")

            # Level 2: Runtime in-memory key overrides os.environ
            ai_engine.set_gemini_api_key("runtime_key_level_2", persist_to_env=False)
            self.assertEqual(ai_engine.get_gemini_api_key(), "runtime_key_level_2")

            # Level 1: Per-request custom key overrides runtime and env
            self.assertEqual(
                ai_engine.get_gemini_api_key(custom_key="request_key_level_1"),
                "request_key_level_1"
            )

    def test_10_ai_health_state_transitions(self):
        """Verify AI engine health status state transitions: NOT_CONFIGURED -> CONFIGURED_UNVERIFIED -> VERIFIED_LIVE -> PROVIDER_ERROR."""
        with patch.dict(os.environ, {}, clear=True):
            # 1. Initially unconfigured
            status = ai_engine.get_ai_status()
            self.assertEqual(status["status"], "NOT_CONFIGURED")
            self.assertFalse(status["configured"])

            # 2. Setting key transitions to CONFIGURED_UNVERIFIED
            ai_engine.set_gemini_api_key("AIzaSyTestTransitionsKey1234", persist_to_env=False)
            status2 = ai_engine.get_ai_status()
            self.assertEqual(status2["status"], "CONFIGURED_UNVERIFIED")
            self.assertTrue(status2["configured"])
            self.assertEqual(status2["masked_key"], "AIzaSy...1234")

            # 3. Successful probe transitions to VERIFIED_LIVE
            mock_res = MagicMock()
            mock_res.text = "PONG"
            mock_client = MagicMock()
            mock_client.models.generate_content.return_value = mock_res
            with patch("google.genai.Client", return_value=mock_client):
                probe = ai_engine.verify_gemini_connection()
                self.assertTrue(probe["success"])
                self.assertEqual(probe["status"], "VERIFIED_LIVE")

            status3 = ai_engine.get_ai_status()
            self.assertEqual(status3["status"], "VERIFIED_LIVE")
            self.assertIsNotNone(status3["last_verified_at"])

            # 4. Clearing key resets to NOT_CONFIGURED
            ai_engine.clear_gemini_api_key()
            status4 = ai_engine.get_ai_status()
            self.assertEqual(status4["status"], "NOT_CONFIGURED")
            self.assertFalse(status4["configured"])

    def test_11_verify_gemini_connection_probe(self):
        """Verify the test_connection probe handles success, failures, and unconfigured states honestly."""
        # Unconfigured probe
        with patch.dict(os.environ, {}, clear=True):
            res_unconfigured = ai_engine.verify_gemini_connection()
            self.assertFalse(res_unconfigured["success"])
            self.assertEqual(res_unconfigured["status"], "NOT_CONFIGURED")

        # Failed probe (Provider error)
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = Exception("API_KEY_INVALID: API key not valid. Please pass a valid API key.")
        with patch("google.genai.Client", return_value=mock_client):
            res_invalid = ai_engine.verify_gemini_connection(api_key="invalid_probe_key_1234")
            self.assertFalse(res_invalid["success"])
            self.assertEqual(res_invalid["status"], "PROVIDER_ERROR")
            self.assertIn("API_KEY_INVALID", res_invalid["error"])

    def test_12_key_masking_security(self):
        """Verify that API keys are masked safely and never leaked."""
        self.assertIsNone(ai_engine.mask_api_key(None))
        self.assertIsNone(ai_engine.mask_api_key(""))
        self.assertEqual(ai_engine.mask_api_key("short"), "***")
        masked = ai_engine.mask_api_key("AIzaSyB1234567890abcdefXYZ9999")
        self.assertTrue(masked.startswith("AIzaSy..."))
        self.assertTrue(masked.endswith("9999"))
        self.assertNotIn("1234567890abcdefXYZ", masked)

    def test_13_api_endpoints_test_connection_and_clear(self):
        """Verify FastAPI endpoints: POST /api/system/test-connection and DELETE /api/system/api-key."""
        # 1. Test POST /api/system/api-key
        post_res = self.client.post("/api/system/api-key", json={"api_key": "AIzaSyEndpointTestKey1234"})
        self.assertEqual(post_res.status_code, 200)
        self.assertEqual(post_res.json()["status"], "success")

        # 2. Test POST /api/system/test-connection with mock
        mock_res = MagicMock()
        mock_res.text = "PONG"
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_res
        with patch("google.genai.Client", return_value=mock_client):
            conn_res = self.client.post("/api/system/test-connection", json={})
            self.assertEqual(conn_res.status_code, 200)
            self.assertTrue(conn_res.json()["success"])
            self.assertEqual(conn_res.json()["status"], "VERIFIED_LIVE")

        # 3. Test DELETE /api/system/api-key
        del_res = self.client.delete("/api/system/api-key")
        self.assertEqual(del_res.status_code, 200)
        self.assertEqual(del_res.json()["ai_status"]["status"], "NOT_CONFIGURED")

if __name__ == "__main__":
    unittest.main(verbosity=2)
