import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.config import get_settings

# Ensure tests run against a lightweight, local SQLite database instead of
# attempting to connect to Postgres on localhost. This mirrors how the
# application can be configured via the DATABASE_URL environment variable and
# keeps test runs self contained.
test_db_path = ROOT / "test.db"
os.environ.setdefault("DATABASE_URL", f"sqlite:///{test_db_path}")

# Clear any cached settings so subsequent imports pick up the test database
# configuration established above.
get_settings.cache_clear()
