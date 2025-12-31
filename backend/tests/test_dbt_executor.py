
import asyncio
import pytest
from datetime import datetime, timezone
from app.schemas.execution import DbtCommand, RunDetail, RunStatus
from app.services.dbt_executor import DbtExecutor

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


def test_stream_logs_emits_error_when_no_output():
    executor = DbtExecutor()
    run_id = "test-run-error"
    executor.run_history[run_id] = RunDetail(
        run_id=run_id,
        command=DbtCommand.RUN,
        status=RunStatus.FAILED,
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc),
        duration_seconds=0.0,
        description="",
        error_message="boom",
        parameters={},
        log_lines=[],
    )

    async def _collect_logs():
        messages = []
        async for log in executor.stream_logs(run_id):
            messages.append(log)
        return messages

    messages = asyncio.run(_collect_logs())

    assert any("boom" in log.message for log in messages)
    assert messages[-1].line_number == 1


def test_stream_logs_adds_terminal_message_without_error():
    executor = DbtExecutor()
    run_id = "test-run-success"
    executor.run_history[run_id] = RunDetail(
        run_id=run_id,
        command=DbtCommand.RUN,
        status=RunStatus.SUCCEEDED,
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc),
        duration_seconds=0.0,
        description="",
        error_message=None,
        parameters={},
        log_lines=[],
    )

    async def _collect_logs():
        messages = []
        async for log in executor.stream_logs(run_id):
            messages.append(log)
        return messages

    messages = asyncio.run(_collect_logs())

    assert any("status succeeded" in log.message for log in messages)
    assert messages[-1].level == "INFO"
