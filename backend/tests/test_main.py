import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

# Patch AWS and google-genai at import time so startup doesn't need real creds
with (
    patch("boto3.client"),
    patch("google.genai.Client"),
):
    from main import app, build_prompt, scrape_job_description

client = TestClient(app)


# ── unit tests ────────────────────────────────────────────────────────────────

def test_build_prompt_contains_sections():
    prompt = build_prompt("Need Python skills", "I know Python")
    assert "JOB DESCRIPTION" in prompt
    assert "RESUME" in prompt
    assert "match_score" in prompt


def test_build_prompt_truncates_gracefully():
    long_jd = "x" * 10_000
    prompt = build_prompt(long_jd, "resume")
    assert len(prompt) > 0


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_metrics_endpoint_exists():
    response = client.get("/metrics")
    assert response.status_code == 200


# ── /analyze endpoint tests ───────────────────────────────────────────────────

MOCK_GEMINI_RESPONSE = json.dumps({
    "match_score": 78,
    "missing_skills": ["Kubernetes", "Terraform"],
    "suggestions": ["Add cloud certifications", "Highlight DevOps projects"],
})


def _make_mock_client(text: str = MOCK_GEMINI_RESPONSE) -> MagicMock:
    mock_response = MagicMock()
    mock_response.text = text
    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response
    return mock_client


@pytest.fixture(autouse=True)
def set_client():
    """Inject a mock Gemini client into app state for every test."""
    app.state.gemini_client = _make_mock_client()
    yield
    app.state.gemini_client = None


@patch("main.scrape_job_description", new_callable=AsyncMock)
def test_analyze_success(mock_scrape):
    mock_scrape.return_value = "We need a Python developer with Kubernetes experience."

    response = client.post(
        "/analyze",
        data={"job_url": "https://example.com/job"},
        files={"resume": ("resume.txt", b"I am a Python developer.", "text/plain")},
    )

    assert response.status_code == 200
    body = response.json()
    assert "match_score" in body
    assert isinstance(body["match_score"], int)
    assert "missing_skills" in body
    assert "suggestions" in body


@patch("main.scrape_job_description", new_callable=AsyncMock)
def test_analyze_scrape_failure(mock_scrape):
    mock_scrape.side_effect = Exception("Connection refused")

    response = client.post(
        "/analyze",
        data={"job_url": "https://bad-url.example.com/job"},
        files={"resume": ("resume.txt", b"Some resume text", "text/plain")},
    )

    assert response.status_code == 400
    assert "Failed to fetch job URL" in response.json()["detail"]


@patch("main.scrape_job_description", new_callable=AsyncMock)
def test_analyze_gemini_bad_json(mock_scrape):
    mock_scrape.return_value = "Job description here"
    app.state.gemini_client = _make_mock_client("not valid json {{")

    response = client.post(
        "/analyze",
        data={"job_url": "https://example.com/job"},
        files={"resume": ("resume.txt", b"Resume content", "text/plain")},
    )

    assert response.status_code == 500
    assert "Gemini error" in response.json()["detail"]


def test_analyze_no_client():
    app.state.gemini_client = None
    app.state.startup_error = "API key missing"

    response = client.post(
        "/analyze",
        data={"job_url": "https://example.com/job"},
        files={"resume": ("resume.txt", b"Resume", "text/plain")},
    )

    assert response.status_code == 503
