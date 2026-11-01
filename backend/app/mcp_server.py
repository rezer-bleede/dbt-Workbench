import argparse
import os
from typing import Any, Literal

import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("dbt-Workbench")
api_url = "http://localhost:8080"
api_key: str | None = None
default_workspace_id: int | None = None


async def request(
    method: str,
    path: str,
    *,
    workspace_id: int | None = None,
    params: dict[str, Any] | None = None,
    json: dict[str, Any] | None = None,
) -> Any:
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    selected_workspace = workspace_id if workspace_id is not None else default_workspace_id
    if selected_workspace is not None:
        headers["X-Workspace-Id"] = str(selected_workspace)
    async with httpx.AsyncClient(base_url=api_url, timeout=60) as client:
        response = await client.request(method, path, headers=headers, params=params, json=json)
    if response.is_error:
        raise RuntimeError(f"Workbench API {response.status_code}: {response.text[:1000]}")
    return response.json()


@mcp.tool()
async def list_workspaces() -> list[dict[str, Any]]:
    """List workspaces accessible to the configured API key."""
    return await request("GET", "/workspaces")


@mcp.tool()
async def list_projects(workspace_id: int | None = None) -> list[dict[str, Any]]:
    """List the project in the selected workspace."""
    return await request("GET", "/projects", workspace_id=workspace_id)


@mcp.tool()
async def get_lineage(max_depth: int | None = None, workspace_id: int | None = None) -> dict[str, Any]:
    """Get the dbt model lineage graph."""
    params = {"max_depth": max_depth} if max_depth is not None else None
    return await request("GET", "/lineage/graph", workspace_id=workspace_id, params=params)


@mcp.tool()
async def search_catalog(query: str, workspace_id: int | None = None) -> dict[str, Any]:
    """Search catalog metadata for models, sources, and columns."""
    return await request("GET", "/catalog/search", workspace_id=workspace_id, params={"query": query})


@mcp.tool()
async def get_artifacts(workspace_id: int | None = None) -> dict[str, Any]:
    """Get the current dbt artifact summary."""
    return await request("GET", "/artifacts", workspace_id=workspace_id)


@mcp.tool()
async def list_runs(page: int = 1, page_size: int = 20, workspace_id: int | None = None) -> dict[str, Any]:
    """List paginated dbt execution history for a workspace."""
    return await request(
        "GET",
        "/execution/runs",
        workspace_id=workspace_id,
        params={"page": page, "page_size": page_size},
    )


@mcp.tool()
async def get_run_status(run_id: str, workspace_id: int | None = None) -> dict[str, Any]:
    """Get status for a dbt execution run."""
    return await request("GET", f"/execution/runs/{run_id}", workspace_id=workspace_id)


@mcp.tool()
async def cancel_run(run_id: str, workspace_id: int | None = None) -> dict[str, Any]:
    """Cancel a running dbt execution."""
    return await request("POST", f"/execution/runs/{run_id}/cancel", workspace_id=workspace_id)


@mcp.tool()
async def list_schedules(workspace_id: int | None = None) -> list[dict[str, Any]]:
    """List schedules in a workspace."""
    return await request("GET", "/schedules", workspace_id=workspace_id)


@mcp.tool()
async def create_schedule(schedule: dict[str, Any], workspace_id: int | None = None) -> dict[str, Any]:
    """Create a schedule using the REST ScheduleCreate fields."""
    return await request("POST", "/schedules", workspace_id=workspace_id, json=schedule)


@mcp.tool()
async def update_schedule(
    schedule_id: int,
    schedule: dict[str, Any],
    workspace_id: int | None = None,
) -> dict[str, Any]:
    """Update a schedule using the REST ScheduleUpdate fields."""
    return await request("PUT", f"/schedules/{schedule_id}", workspace_id=workspace_id, json=schedule)


@mcp.tool()
async def run_dbt(
    command: Literal["build", "run", "test", "seed", "docs generate", "deps"],
    select: str | None = None,
    description: str | None = None,
    workspace_id: int | None = None,
) -> dict[str, Any]:
    """Start a dbt build, run, test, seed, docs, or deps command."""
    parameters = {"select": select} if select else {}
    return await request(
        "POST",
        "/execution/runs",
        workspace_id=workspace_id,
        json={"command": command, "parameters": parameters, "description": description},
    )


@mcp.tool()
async def trigger_schedule(schedule_id: int, workspace_id: int | None = None) -> dict[str, Any]:
    """Trigger a schedule immediately."""
    return await request("POST", f"/schedules/{schedule_id}/run", workspace_id=workspace_id)


@mcp.tool()
async def run_sql(
    sql: str,
    row_limit: int | None = None,
    environment_id: int | None = None,
    workspace_id: int | None = None,
) -> dict[str, Any]:
    """Execute SQL using the workspace's configured SQL safety rules."""
    return await request(
        "POST",
        "/sql/execute",
        workspace_id=workspace_id,
        json={"sql": sql, "row_limit": row_limit, "environment_id": environment_id},
    )


def main() -> None:
    global api_url, api_key, default_workspace_id
    parser = argparse.ArgumentParser(description="dbt-Workbench MCP server (stdio)")
    parser.add_argument("--api-url", default=os.getenv("DBT_WORKBENCH_API_URL", "http://localhost:8080"))
    parser.add_argument("--api-key", default=os.getenv("DBT_WORKBENCH_API_KEY"))
    parser.add_argument(
        "--workspace-id",
        type=int,
        default=os.getenv("DBT_WORKBENCH_WORKSPACE_ID"),
    )
    args = parser.parse_args()
    api_url = args.api_url.rstrip("/")
    api_key = args.api_key
    default_workspace_id = int(args.workspace_id) if args.workspace_id is not None else None
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
