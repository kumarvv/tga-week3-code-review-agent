import asyncio

from langgraph.graph import END, START, StateGraph

from backend.models import State
from backend.model_config import resolve_model
from backend.orchestrator_agent import create_orchestrator_agent
from backend.review_agent import create_review_agent, AGENTS

async def run_review(files: list[dict], focus: str, emit, model_name: str | None = None) -> dict:
    model_name = resolve_model(model_name)
    graph = StateGraph(State)

    # add review agents 
    for name in AGENTS:
        reviewAgent = create_review_agent(name=name, files=files, emit=emit, model_name=model_name)
        graph.add_node(name, reviewAgent)
        graph.add_edge(START, name)

    # add orchestrator agent 
    orchestrator_agent = create_orchestrator_agent(files=files, emit=emit, model_name=model_name)
    graph.add_node('orchestrator', orchestrator_agent)

    graph.add_edge(list(AGENTS), 'orchestrator')
    graph.add_edge('orchestrator', END)

    context = '\n\n'.join(f"FILE {f['path']}\n{f['content']}" for f in files)
    async with asyncio.timeout(480):
        state = await graph.compile().ainvoke({'context': context, 'focus': focus, 'reviews': []})

    return state['report']
