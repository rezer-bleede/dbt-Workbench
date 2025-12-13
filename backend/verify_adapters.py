import sys
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add backend directory to sys.path
sys.path.append(os.getcwd())

# Mock dependencies before importing 
sys.modules['app.core.auth'] = MagicMock()
sys.modules['app.database.connection'] = MagicMock()
sys.modules['app.database.models'] = MagicMock()
sys.modules['app.services.plugin_service'] = MagicMock()
sys.modules['app.api.routes.profiles'] = MagicMock()

# Mock get_profiles_file dependency result
mock_profiles_path = Path("mock_profiles.yml")

# Write a dummy profiles.yml
with open("mock_profiles.yml", "w") as f:
    f.write("""
default:
  outputs:
    dev:
      type: snowflake
      account: blah
    prod:
      type: postgres
      host: localhost
""")

# Mock PackageManager
with patch('app.services.package_manager.PackageManager') as MockPM:
    MockPM.list_installed_packages.return_value = [
        {'name': 'dbt-postgres', 'version': '1.5.0'},
        {'name': 'dbt-core', 'version': '1.5.0'}
    ]
    
    # Import the function to test
    # We need to import after mocking sys.modules to avoid SideEffects
    from app.api.routes.plugins import list_adapter_suggestions
    
    print("Testing adapter suggestions...")
    suggestions = list_adapter_suggestions(profiles_file=mock_profiles_path)
    
    postgres = next((s for s in suggestions if s.type == 'postgres'), None)
    snowflake = next((s for s in suggestions if s.type == 'snowflake'), None)
    
    if postgres and postgres.installed:
        print("PASS: Postgres identified as installed")
    else:
        print(f"FAIL: Postgres status: {postgres}")

    if snowflake and not snowflake.installed and snowflake.required_by_profile:
        print("PASS: Snowflake identified as missing but required")
    else:
        print(f"FAIL: Snowflake status: {snowflake}")

# Cleanup
if os.path.exists("mock_profiles.yml"):
    os.remove("mock_profiles.yml")
