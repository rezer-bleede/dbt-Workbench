from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from ..connection import Base

class Model(Base):
    __tablename__ = "models"

    id = Column(Integer, primary_key=True, index=True)
    unique_id = Column(String, unique=True, index=True)
    name = Column(String)
    schema = Column(String)
    database = Column(String)
    resource_type = Column(String)
    columns = Column(JSON)
    tags = Column(JSON, default=list)
    checksum = Column(String)
    timestamp = Column(DateTime)
    run_id = Column(Integer, ForeignKey("runs.id"))

    run = relationship("Run", back_populates="models")

class Run(Base):
    __tablename__ = "runs"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(String, unique=True, index=True)
    command = Column(String)
    timestamp = Column(DateTime)
    status = Column(String)
    summary = Column(JSON)

    models = relationship("Model", back_populates="run")
    tests = relationship("Test", back_populates="run")
    artifacts = relationship("Artifact", back_populates="run")

class Lineage(Base):
    __tablename__ = "lineage"

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(String, ForeignKey("models.unique_id"))
    child_id = Column(String, ForeignKey("models.unique_id"))
    run_id = Column(Integer, ForeignKey("runs.id"))


class ColumnLineage(Base):
    __tablename__ = "column_lineage"

    id = Column(Integer, primary_key=True, index=True)
    source_column = Column(String, index=True)
    target_column = Column(String, index=True)
    source_node = Column(String, ForeignKey("models.unique_id"))
    target_node = Column(String, ForeignKey("models.unique_id"))
    run_id = Column(Integer, ForeignKey("runs.id"))

class Test(Base):
    __tablename__ = "tests"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    model_ids = Column(JSON)
    status = Column(String)
    timestamp = Column(DateTime)
    run_id = Column(Integer, ForeignKey("runs.id"))

    run = relationship("Run", back_populates="tests")

class Artifact(Base):
    __tablename__ = "artifacts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    checksum = Column(String)
    metadata_ = Column("metadata", JSON)
    run_id = Column(Integer, ForeignKey("runs.id"))

    run = relationship("Run", back_populates="artifacts")
