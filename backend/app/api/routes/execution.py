import asyncio
from typing import List, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse

from app.schemas.execution import (
    RunRequest, RunSummary, RunDetail, RunHistoryResponse, 
    RunArtifactsResponse, LogMessage
)
from app.services.dbt_executor import executor


router = APIRouter(prefix="/execution", tags=["execution"])


@router.post("/runs", response_model=RunSummary)
async def start_run(run_request: RunRequest, background_tasks: BackgroundTasks):
    """Start a new dbt run."""
    try:
        # Start the run
        run_id = await executor.start_run(
            command=run_request.command,
            parameters=run_request.parameters or {},
            description=run_request.description
        )
        
        # Execute in background
        background_tasks.add_task(executor.execute_run, run_id)
        
        # Return initial status
        run_status = executor.get_run_status(run_id)
        if not run_status:
            raise HTTPException(status_code=500, detail="Failed to create run")
        
        return run_status
    
    except RuntimeError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start run: {str(e)}")


@router.get("/runs/{run_id}", response_model=RunSummary)
async def get_run_status(run_id: str):
    """Get the status of a specific run."""
    run_status = executor.get_run_status(run_id)
    if not run_status:
        raise HTTPException(status_code=404, detail="Run not found")
    return run_status


@router.get("/runs/{run_id}/detail", response_model=RunDetail)
async def get_run_detail(run_id: str):
    """Get detailed information about a run."""
    run_detail = executor.get_run_detail(run_id)
    if not run_detail:
        raise HTTPException(status_code=404, detail="Run not found")
    return run_detail


@router.get("/runs", response_model=RunHistoryResponse)
async def get_run_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
):
    """Get paginated run history."""
    runs = executor.get_run_history(page=page, page_size=page_size)
    total_count = len(executor.run_history)
    
    return RunHistoryResponse(
        runs=runs,
        total_count=total_count,
        page=page,
        page_size=page_size
    )


@router.get("/runs/{run_id}/logs")
async def stream_run_logs(run_id: str):
    """Stream logs for a running dbt command using Server-Sent Events."""
    run_status = executor.get_run_status(run_id)
    if not run_status:
        raise HTTPException(status_code=404, detail="Run not found")
    
    async def log_generator():
        try:
            async for log_message in executor.stream_logs(run_id):
                yield {
                    "event": "log",
                    "data": log_message.model_dump_json()
                }
        except Exception as e:
            yield {
                "event": "error",
                "data": f"Error streaming logs: {str(e)}"
            }
        finally:
            yield {
                "event": "end",
                "data": "Log stream ended"
            }
    
    return EventSourceResponse(log_generator())


@router.get("/runs/{run_id}/artifacts", response_model=RunArtifactsResponse)
async def get_run_artifacts(run_id: str):
    """Get artifacts for a specific run."""
    if run_id not in executor.run_history:
        raise HTTPException(status_code=404, detail="Run not found")
    
    artifacts = executor.get_run_artifacts(run_id)
    artifacts_path = executor.run_artifacts.get(run_id, "")
    
    return RunArtifactsResponse(
        run_id=run_id,
        artifacts=artifacts,
        artifacts_path=artifacts_path
    )


@router.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: str):
    """Cancel a running dbt command."""
    if run_id not in executor.run_history:
        raise HTTPException(status_code=404, detail="Run not found")
    
    success = executor.cancel_run(run_id)
    if not success:
        raise HTTPException(status_code=400, detail="Run cannot be cancelled")
    
    return {"message": "Run cancelled successfully"}


@router.post("/cleanup")
async def cleanup_old_runs():
    """Clean up old runs and artifacts."""
    executor.cleanup_old_runs()
    return {"message": "Cleanup completed"}


@router.get("/status")
async def get_execution_status():
    """Get overall execution system status."""
    active_runs = len([r for r in executor.active_runs.values() if r.poll() is None])
    total_runs = len(executor.run_history)
    
    return {
        "active_runs": active_runs,
        "total_runs": total_runs,
        "max_concurrent_runs": executor.settings.max_concurrent_runs,
        "max_run_history": executor.settings.max_run_history
    }