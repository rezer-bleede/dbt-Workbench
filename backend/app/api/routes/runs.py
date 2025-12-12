from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.database.services import dbt_service
from app.schemas import dbt as dbt_schemas

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/runs", response_model=list[dbt_schemas.Run])
def list_runs(db: Session = Depends(dbt_service.get_db), skip: int = 0, limit: int = 100):
    runs = dbt_service.get_runs(db, skip=skip, limit=limit)
    return runs


@router.get("/runs/{run_id}", response_model=dbt_schemas.Run)
def get_run(run_id: int, db: Session = Depends(dbt_service.get_db)):
    db_run = dbt_service.get_run(db, run_id=run_id)
    if db_run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return db_run
