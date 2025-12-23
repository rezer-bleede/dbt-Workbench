# Contribution Guidelines — dbt-Workbench

Thank you for your interest in contributing to dbt-Workbench.  
This project is designed to evolve quickly. Follow these guidelines to ensure clean, consistent, and maintainable contributions.

---

## 1. Ground Rules

- No binary files in any pull request
- All UI must use Tailwind CSS
- Backend must use FastAPI with Pydantic
- Frontend must use React + TypeScript
- All Docker builds must remain reproducible
- Follow the roadmap unless proposing otherwise
- Every PR must reference an Issue

---

## 2. Development Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 14+ (for local dev without Docker)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Set required environment variables
export POSTGRES_HOST=localhost
export DBT_ARTIFACTS_PATH=../sample_artifacts

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev -- --host --port 3000
```

### Full Stack (Docker)

```bash
docker compose up --build
```

### Environment Variables

Create a `.env` file in `backend/` for local development:

```env
POSTGRES_HOST=localhost
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=dbt_workbench
DBT_ARTIFACTS_PATH=../sample_artifacts
AUTH_ENABLED=false
```

---

## 3. Code Style Requirements

### Backend (Python/FastAPI)

| Rule | Details |
|------|---------|
| Type annotations | Required on all functions |
| Pydantic models | Required for all API schemas |
| Route handlers | Thin, delegate to services |
| Business logic | Lives in `app/services/` |
| Database queries | Use `app/database/services/` |
| Error handling | Graceful handling for missing data |
| Docstrings | Required for public functions |

**Example route pattern:**
```python
@router.get("/{id}", response_model=MySchema)
def get_item(
    id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> MySchema:
    """Get item by ID."""
    return my_service.get_item(db, id, workspace_id=workspace.id)
```

### Frontend (React/TypeScript)

| Rule | Details |
|------|---------|
| Components | Functional only (no classes) |
| State | React hooks (useState, useContext) |
| API calls | Via shared service clients in `services/` |
| Styling | Tailwind CSS utilities |
| Types | Explicit interfaces/types |
| Props | Destructured with types |

**Example component pattern:**
```tsx
interface Props {
  id: string;
  onSelect: (id: string) => void;
}

export function MyComponent({ id, onSelect }: Props) {
  const [data, setData] = useState<MyType | null>(null);
  
  useEffect(() => {
    myService.fetch(id).then(setData);
  }, [id]);
  
  return <div className="p-4 bg-gray-800">{/* ... */}</div>;
}
```

### Git Workflow

| Commit Type | Format |
|-------------|--------|
| Feature | `feat: add model detail page` |
| Fix | `fix: lineage edge direction` |
| Refactor | `refactor: extract auth service` |
| Chore | `chore: update docker config` |
| Docs | `docs: update API reference` |
| Test | `test: add scheduler unit tests` |

**Branch Naming:**
- `feature/short-description`
- `fix/issue-number-description`
- `refactor/component-name`

---

## 4. Testing

### Backend

```bash
cd backend
pytest                      # Run all tests
pytest tests/unit/          # Unit tests only
pytest -v --tb=short        # Verbose with short traceback
pytest --cov=app            # With coverage
```

**Test file structure:**
```
backend/tests/
├── unit/
│   ├── test_services/
│   └── test_schemas/
├── integration/
│   └── test_routes/
└── conftest.py
```

### Frontend

```bash
cd frontend
npm test                    # Run all tests
npm run test:coverage       # With coverage
npm run lint                # Lint check
```

---

## 5. Pull Requests

### Required in every PR:

- [ ] Clear description of the change
- [ ] Reference to Issue number(s)
- [ ] Before/after screenshots (for UI changes)
- [ ] Steps to test locally
- [ ] Passing CI checks
- [ ] Updated documentation (if applicable)

### PR Template:

```markdown
## Description
Brief description of changes

## Related Issue
Fixes #123

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How did you test this?

## Screenshots
(if applicable)

## Checklist
- [ ] Code follows project style
- [ ] Tests added/updated
- [ ] Docs updated
- [ ] PR title follows commit convention
```

---

## 6. Security Guidelines

| Requirement | Details |
|-------------|---------|
| Secrets | Never commit to repo |
| Credentials | Use environment variables |
| SQL | Use parameterized queries (ORM) |
| File access | Validate against allowed paths |
| User input | Validate with Pydantic |
| Authentication | Respect RBAC decorators |

**Reporting vulnerabilities:**
- Open a private security issue
- Do not post publicly until resolved

---

## 7. Adding New Features

### Backend API Endpoint

1. Define Pydantic schemas in `app/schemas/`
2. Create service function in `app/services/`
3. Add route in `app/api/routes/`
4. Register router in `app/main.py`
5. Add tests in `tests/`

### Frontend Page

1. Create page component in `pages/`
2. Add route in router configuration
3. Add navigation link in sidebar
4. Create service client in `services/`
5. Add types in `types/`

### Plugin Extension

1. See `PLUGIN_SYSTEM.md` for specification
2. Create plugin directory structure
3. Define `manifest.json`
4. Implement backend/frontend as needed
5. Test with hot-reload enabled

---

## 8. Documentation

When to update docs:

- New environment variables → README.md
- New API endpoints → README.md API Reference
- Architecture changes → ARCHITECTURE.md
- New features → ROADMAP.md (mark complete)
- Plugin changes → PLUGIN_SYSTEM.md
- Documentation screenshots → reuse existing UI snapshots in-repo (avoid adding new binary assets)

---

## 9. Feature Requests

Open a GitHub Issue with:

- Clear problem description
- Proposed solution
- Mock UI (if relevant)
- Expected behavior
- Implementation considerations

---

## 10. License

All contributions fall under the MIT License of this repository.

---

## Questions?

- Review existing issues and discussions
- Open a new discussion for general questions
- Tag maintainers for blocking issues
