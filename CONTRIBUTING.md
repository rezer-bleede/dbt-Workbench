# CONTRIBUTING.md

## Contribution Guidelines — dbt-Workbench

Thank you for your interest in contributing to dbt-Workbench.  
This project is early-stage and designed to evolve quickly. Follow these guidelines to ensure clean, consistent, and maintainable contributions.

---

## 1. Ground Rules

- No binary files in any pull request.
- All UI must use Tailwind CSS.
- Backend must use FastAPI.
- Frontend must use React + TypeScript.
- All Docker builds must remain reproducible and lightweight.
- All features should follow the roadmap unless proposed otherwise.
- Every PR must reference an Issue or create a new one.

---

## 2. Development Setup

### Backend
```
cd backend
uvicorn app.main:app --reload
```

### Frontend
```
cd frontend
npm install
npm run dev
```

### Full Stack (Docker)
```
docker compose up --build
```

---

## 3. Code Style Requirements

### Backend (FastAPI)
- Follow Pydantic models for all API responses.
- Every endpoint must handle missing artifacts gracefully.
- Use `app/services` for logic, not inside routes.
- Enable typing everywhere (no untyped functions).

### Frontend (React + TS)
- Use functional components only.
- Prefer hooks over class components.
- All requests must go through a shared API client.
- UI must follow a clean dashboard style using Tailwind.

### Git
- Always create feature branches.
- Use clear commit messages:
  - `feat: add model detail page`
  - `fix: lineage edge direction`
  - `chore: update docker config`

---

## 4. Testing

- Add unit tests for backend services.
- Add lightweight component tests for UI.
- CI must pass before merging.

---

## 5. Pull Requests

Your PR must include:

- A clear description of the change.
- Before/after screenshots (UI changes).
- Steps to test locally.
- Reference to Issue numbers.

Maintainers reserve the right to request revisions.

---

## 6. Security

- Never include secrets or credentials.
- Do not hardcode dbt project paths.
- Validate all file I/O operations.

---

## 7. Feature Requests

Open a GitHub Issue with:

- Clear problem description  
- Proposed solution  
- Mock UI if relevant  
- Expected behavior  

---

## 8. License

All contributions fall under the MIT License of this repository.

