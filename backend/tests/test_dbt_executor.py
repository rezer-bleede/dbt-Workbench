
import pytest
from app.services.dbt_executor import DbtExecutor
from app.schemas.execution import DbtCommand

def test_get_dbt_command_docs_generate():
    executor = DbtExecutor()
    cmd = executor._get_dbt_command(DbtCommand.DOCS_GENERATE, {})
    # Should be ['dbt', 'docs', 'generate', ...others]
    assert cmd[:3] == ['dbt', 'docs', 'generate']

def test_get_dbt_command_run():
    executor = DbtExecutor()
    cmd = executor._get_dbt_command(DbtCommand.RUN, {})
    assert cmd[:2] == ['dbt', 'run']

def test_dbt_commmand_profile():
    executor = DbtExecutor()
    cmd = executor._get_dbt_command(DbtCommand.RUN, {"profile": "my_profile"})
    assert "--profile" in cmd
    idx = cmd.index("--profile")
    assert cmd[idx+1] == "my_profile"
