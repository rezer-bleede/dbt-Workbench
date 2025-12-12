from sqlalchemy.orm import Session

from ..connection import SessionLocal
from ..models import models as db_models
from ...schemas import dbt as dbt_schemas

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_run(db: Session, run: dbt_schemas.Run, *, workspace_id: int | None = None):
    payload = run.model_dump()
    payload["workspace_id"] = workspace_id
    db_run = db_models.Run(**payload)
    db.add(db_run)
    db.commit()
    db.refresh(db_run)
    return db_run

def get_run(db: Session, run_id: int, *, workspace_id: int | None = None):
    query = db.query(db_models.Run).filter(db_models.Run.id == run_id)
    if workspace_id is not None:
        query = query.filter(db_models.Run.workspace_id == workspace_id)
    return query.first()

def get_runs(db: Session, skip: int = 0, limit: int = 100, *, workspace_id: int | None = None):
    query = db.query(db_models.Run)
    if workspace_id is not None:
        query = query.filter(db_models.Run.workspace_id == workspace_id)
    return query.offset(skip).limit(limit).all()

def create_model(db: Session, model: dbt_schemas.Model):
    db_model = db_models.Model(**model.dict())
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model

def get_model(db: Session, model_id: int):
    return db.query(db_models.Model).filter(db_models.Model.id == model_id).first()

def get_models(db: Session, skip: int = 0, limit: int = 100):
    return db.query(db_models.Model).offset(skip).limit(limit).all()

def get_lineage_graph(db: Session, run_id: int = None) -> dbt_schemas.LineageGraph:
    query = db.query(db_models.Lineage)
    if run_id:
        query = query.filter(db_models.Lineage.run_id == run_id)

    lineage_relations = query.all()

    if not lineage_relations:
        return dbt_schemas.LineageGraph(nodes=[], edges=[])

    edges = [
        dbt_schemas.LineageEdge(source=rel.parent_id, target=rel.child_id)
        for rel in lineage_relations
    ]

    model_unique_ids = set()
    for rel in lineage_relations:
        model_unique_ids.add(rel.parent_id)
        model_unique_ids.add(rel.child_id)

    models = db.query(db_models.Model).filter(db_models.Model.unique_id.in_(model_unique_ids)).all()

    nodes = [
        dbt_schemas.LineageNode(
            id=model.unique_id,
            label=model.name,
            type=model.resource_type
        ) for model in models
    ]

    return dbt_schemas.LineageGraph(nodes=nodes, edges=edges)
