import os
import json
import asyncio
import boto3
import httpx
from google import genai
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from bs4 import BeautifulSoup

app = FastAPI(title="Resume & Job Match Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

Instrumentator().instrument(app).expose(app)


def get_gemini_api_key() -> str:
    secret_name = os.environ.get("GEMINI_SECRET_NAME", "gemini-api-key")
    region = os.environ.get("AWS_REGION", "us-east-1")

    # In local/dev mode, fall back to env var if Secrets Manager is unavailable
    if os.environ.get("USE_LOCAL_API_KEY") == "true":
        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            raise RuntimeError("GEMINI_API_KEY env var not set")
        return key

    client = boto3.client("secretsmanager", region_name=region)
    response = client.get_secret_value(SecretId=secret_name)
    secret = response.get("SecretString", "{}")
    data = json.loads(secret)
    return data.get("GEMINI_API_KEY") or data.get("api_key") or secret


@app.on_event("startup")
async def configure_gemini():
    try:
        api_key = get_gemini_api_key()
        app.state.gemini_client = genai.Client(api_key=api_key)
    except Exception as exc:
        app.state.gemini_client = None
        app.state.startup_error = str(exc)


async def scrape_job_description(url: str) -> str:
    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    return text[:8000]


def build_prompt(job_description: str, resume_text: str) -> str:
    return f"""
You are an expert career coach and technical recruiter. Analyze the job description and resume below.

Respond ONLY with valid JSON in this exact schema (no markdown, no extra text):
{{
  "match_score": <integer 0-100>,
  "missing_skills": [<string>, ...],
  "suggestions": [<string>, ...]
}}

Rules:
- match_score: how well the resume matches the job (0=no match, 100=perfect)
- missing_skills: skills/qualifications in the job description absent from the resume
- suggestions: 3-5 specific, actionable improvements for the resume

JOB DESCRIPTION:
{job_description}

RESUME:
{resume_text}
"""


@app.post("/analyze")
async def analyze(
    resume: UploadFile = File(...),
    job_url: str = Form(None),
    job_text: str = Form(None),
):
    if not app.state.gemini_client:
        error = getattr(app.state, "startup_error", "Gemini client not initialized")
        raise HTTPException(status_code=503, detail=error)

    if not job_url and not job_text:
        raise HTTPException(status_code=422, detail="Provide either job_url or job_text.")
    if job_url and job_text:
        raise HTTPException(status_code=422, detail="Provide only one of job_url or job_text.")

    resume_bytes = await resume.read()
    try:
        resume_text = resume_bytes.decode("utf-8")
    except UnicodeDecodeError:
        resume_text = resume_bytes.decode("latin-1")

    if job_url:
        try:
            job_description = await scrape_job_description(job_url)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Failed to fetch job URL: {exc}")
    else:
        job_description = job_text

    prompt = build_prompt(job_description, resume_text)

    loop = asyncio.get_running_loop()
    last_exc = None
    for attempt in range(4):  # 1 initial attempt + 3 retries
        try:
            response = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    lambda: app.state.gemini_client.models.generate_content(
                        model="gemini-3.1-flash-lite-preview",
                        contents=prompt,
                    ),
                ),
                timeout=60.0,
            )
            raw = response.text.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            result = json.loads(raw)
            break
        except Exception as exc:
            last_exc = exc
            retryable = isinstance(exc, asyncio.TimeoutError) or any(
                code in str(exc) for code in ("503", "504", "UNAVAILABLE", "DEADLINE_EXCEEDED")
            )
            if retryable and attempt < 3:
                await asyncio.sleep(2)
                continue
            if not retryable:
                raise HTTPException(status_code=500, detail=f"Gemini error: {exc}")
    else:
        raise HTTPException(status_code=503, detail=f"Gemini unavailable after retries: {last_exc}")

    return result


@app.get("/health")
async def health():
    return {"status": "ok"}
