import operator

from pydantic import BaseModel, Field
from typing import Literal, TypedDict, Annotated

class Finding(BaseModel):
    title: str
    severity: Literal['critical', 'high', 'medium', 'low']
    category: Literal['bugs', 'security', 'tests']
    file: str
    line: int = Field(ge=1)
    explanation: str
    recommendation: str


class AgentReview(BaseModel):
    summary: str
    findings: list[Finding] = Field(max_length=25)


class CombinedReview(BaseModel):
    summary: str
    findings: list[Finding] = Field(max_length=75)


class State(TypedDict):
    context: str
    focus: str
    reviews: Annotated[list[dict], operator.add]
    report: dict
