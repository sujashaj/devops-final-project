# AI-Powered Resume & Job Match Analyzer

A full-stack web application that scrapes a job posting URL, compares it with an uploaded resume using Google Gemini AI, and returns a match score (0–100), a list of missing skills, and actionable resume improvement suggestions.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER BROWSER                                   │
│                     http://localhost:3000 (or EC2 IP)                       │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ HTTP / HTTPS
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND  (React + MUI)                              │
│                   Docker container · nginx · port 80/3000                    │
│  - Job URL input form                                                        │
│  - Resume file upload (.txt / .pdf / .doc)                                   │
│  - Displays: match score gauge, missing skills chips, suggestions list       │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ POST /analyze  (multipart/form-data)
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       BACKEND  (Python FastAPI)                              │
│                   Docker container · uvicorn · port 8000                     │
│                                                                              │
│  ① Scrapes job description from URL  (httpx + BeautifulSoup)                │
│  ② Reads Gemini API key from AWS Secrets Manager (boto3) via KMS            │
│  ③ Sends job + resume to Gemini 1.5 Flash → JSON response                  │
│  ④ Exposes /metrics endpoint for Prometheus                                  │
│  ⑤ Exposes /health endpoint for load-balancer health checks                 │
└────────┬──────────────────────────────────┬─────────────────────────────────┘
         │                                  │
         │ boto3 / HTTPS                    │ HTTPS
         ▼                                  ▼
┌──────────────────────┐       ┌────────────────────────────────┐
│  AWS SECRETS MANAGER │       │      GOOGLE GEMINI API         │
│  "gemini-api-key"    │       │   gemini-1.5-flash model       │
│  encrypted via KMS   │       │   (returns JSON analysis)      │
└──────────────────────┘       └────────────────────────────────┘

                MONITORING (same Docker Compose network)
┌──────────────────────────────────────────────────────────────────┐
│  Prometheus  (port 9090)  ──scrapes /metrics every 15s──▶ Backend│
│  Grafana     (port 3001)  ──reads──▶ Prometheus                  │
│    Dashboards: Request Rate · Avg Response Time · Error Rate     │
└──────────────────────────────────────────────────────────────────┘

               CI/CD  (GitHub Actions)
┌──────────────────────────────────────────────────────────────────┐
│  Push to GitHub                                                  │
│      │                                                           │
│      ▼                                                           │
│  1. checkout code                                                │
│  2. pytest  (backend)     ← pipeline STOPS if tests fail        │
│  3. Jest    (frontend)    ← pipeline STOPS if tests fail        │
│  4. Build Docker images → push to Amazon ECR                    │
│  5. SSH deploy → Test EC2  (tagged "test")                      │
│  6. SSH deploy → Prod EC2  (tagged "production", main only)     │
└──────────────────────────────────────────────────────────────────┘

               INFRASTRUCTURE  (Terraform · us-east-1)
┌──────────────────────────────────────────────────────────────────┐
│  AWS EC2  t2.micro  ×2                                           │
│    ├── resume-analyzer-test        (Environment=test)            │
│    └── resume-analyzer-production  (Environment=production)      │
│  IAM Role → allows GetSecretValue from Secrets Manager           │
│  KMS Key  → encrypts the Gemini API key secret                   │
└──────────────────────────────────────────────────────────────────┘

               KUBERNETES  (/k8s folder — optional orchestration)
┌──────────────────────────────────────────────────────────────────┐
│  Deployment: 2 replicas of FastAPI backend                       │
│  Service:    ClusterIP (backend :8000) · LoadBalancer (frontend) │
│  ConfigMap:  ENVIRONMENT, AWS_REGION, GEMINI_SECRET_NAME         │
└──────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
.
├── backend/                   FastAPI application
│   ├── main.py                API routes, Gemini integration, Secrets Manager
│   ├── requirements.txt
│   ├── Dockerfile
│   └── tests/
│       └── test_main.py       pytest test suite
├── frontend/                  React + Material UI application
│   ├── src/
│   │   ├── App.js
│   │   └── components/
│   │       ├── ResumeAnalyzer.js
│   │       └── ResumeAnalyzer.test.js   Jest test suite
│   ├── public/index.html
│   ├── nginx.conf
│   ├── package.json
│   └── Dockerfile
├── k8s/                       Kubernetes manifests
│   ├── deployment.yaml        2-replica backend + frontend deployments
│   ├── service.yaml           ClusterIP (backend) + LoadBalancer (frontend)
│   └── configmap.yaml         Environment config
├── terraform/                 AWS infrastructure
│   ├── main.tf                EC2 ×2, Secrets Manager, KMS, IAM
│   ├── variables.tf
│   └── outputs.tf
├── monitoring/
│   ├── prometheus.yml         Scrapes /metrics every 15 s
│   └── grafana/
│       ├── provisioning/
│       │   ├── datasources/prometheus.yml   Auto-connects Grafana → Prometheus
│       │   └── dashboards/dashboards.yml
│       └── dashboards/
│           └── resume-analyzer.json        Pre-built dashboard
├── .github/
│   └── workflows/
│       └── ci-cd.yml          GitHub Actions pipeline
├── docker-compose.yml         4 services: frontend, backend, prometheus, grafana
└── README.md
```

---

## Prerequisites

| Tool | Minimum Version |
|------|----------------|
| Docker + Docker Compose | 24.x / v2.x |
| Node.js | 20.x |
| Python | 3.11 |
| Terraform | 1.5+ |
| AWS CLI | 2.x |

---

## Quick Start — Local Development

### 1. Clone and configure environment

```bash
git clone <your-repo-url>
cd devops-final-project
```

Create a `.env` file (never commit this):

```bash
# .env — local development only
USE_LOCAL_API_KEY=true
GEMINI_API_KEY=your_gemini_api_key_here
```

### 2. Start all four services with one command

```bash
docker-compose up --build
```

| Service | URL |
|---------|-----|
| Frontend (React app) | http://localhost:3000 |
| Backend (FastAPI) | http://localhost:8000 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (admin / admin) |

### 3. Run tests locally

**Backend (pytest):**
```bash
cd backend
pip install -r requirements.txt pytest
USE_LOCAL_API_KEY=true GEMINI_API_KEY=test pytest tests/ -v
```

**Frontend (Jest):**
```bash
cd frontend
npm install --legacy-peer-deps
npm test -- --watchAll=false
```

---

## Terraform — Provision AWS Infrastructure

```bash
cd terraform

# Initialize providers
terraform init

# Preview changes
terraform plan \
  -var="ssh_public_key=$(cat ~/.ssh/id_rsa.pub)" \
  -var="gemini_api_key=YOUR_GEMINI_KEY"

# Apply (creates 2 EC2 instances + Secrets Manager + KMS)
terraform apply \
  -var="ssh_public_key=$(cat ~/.ssh/id_rsa.pub)" \
  -var="gemini_api_key=YOUR_GEMINI_KEY"
```

Outputs include the public IPs of the test and production EC2 instances.

**Never pass secrets on the command line in production** — use a `terraform.tfvars` file (add to `.gitignore`) or AWS Parameter Store.

---

## GitHub Actions CI/CD

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS IAM access key |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret key |
| `EC2_SSH_PRIVATE_KEY` | PEM private key for EC2 SSH |
| `TEST_EC2_HOST` | Public IP of test EC2 instance |
| `PROD_EC2_HOST` | Public IP of production EC2 instance |

### Pipeline Steps

```
Push to GitHub
    │
    ├─▶ [1] pytest (backend)       ← stops entire pipeline on failure
    ├─▶ [2] Jest (frontend)        ← stops entire pipeline on failure
    │
    ▼ (both tests pass)
    ├─▶ [3] Build & push Docker images → Amazon ECR
    ├─▶ [4] Deploy → Test EC2       (develop + main branches)
    └─▶ [5] Deploy → Production EC2 (main branch only, after test deploy)
```

---

## Kubernetes Deployment

```bash
# Apply all manifests
kubectl apply -f k8s/

# Check pods (2 replicas of backend)
kubectl get pods -l app=resume-analyzer

# Check services
kubectl get svc -l app=resume-analyzer
```

The backend is exposed on port 8000 (ClusterIP) and the frontend on port 80 (LoadBalancer).

---

## Monitoring

### Prometheus — http://localhost:9090

Automatically scrapes `http://backend:8000/metrics` every 15 seconds via `prometheus-fastapi-instrumentator`.

Useful queries:
- Request rate: `rate(http_requests_total[1m])`
- Avg response time: `rate(http_request_duration_seconds_sum[1m]) / rate(http_request_duration_seconds_count[1m])`
- Error rate: `sum(rate(http_requests_total{status_code=~"4..|5.."}[1m])) by (status_code)`

### Grafana — http://localhost:3001

Login: `admin` / `admin`

The **Resume Analyzer - API Metrics** dashboard is pre-loaded and shows:
- HTTP request rate (req/s)
- Average response time (seconds)
- Error rate (4xx + 5xx)
- Total request counter
- P95 latency

---

## Security Notes

- **Gemini API key** is stored in AWS Secrets Manager, encrypted with a KMS customer-managed key. The FastAPI app reads it at startup via `boto3` — it is never in source code, Docker images, or environment files.
- **AWS credentials** are injected only via GitHub Actions secrets or EC2 IAM roles — never hardcoded.
- The `.env` file is for local development only and must be added to `.gitignore`.

---

## API Reference

### `POST /analyze`

Analyzes resume–job match.

**Request:** `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `job_url` | string | URL of the job posting |
| `resume` | file | Resume file (.txt, .pdf, .doc, .docx) |

**Response:** `application/json`

```json
{
  "match_score": 78,
  "missing_skills": ["Kubernetes", "Terraform", "CI/CD"],
  "suggestions": [
    "Add a dedicated DevOps/cloud section highlighting AWS experience",
    "Mention specific Kubernetes projects or certifications",
    "Quantify achievements with metrics (e.g., reduced deploy time by 40%)"
  ]
}
```

### `GET /health`

Returns `{"status": "ok"}` — used by load balancers and liveness probes.

### `GET /metrics`

Prometheus metrics endpoint — scraped automatically every 15 seconds.
