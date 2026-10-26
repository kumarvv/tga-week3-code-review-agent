"""Review model choices shared by the API and workflow."""
import os

# General-purpose text models with structured outputs. Catalog checked 2026-10-26.
# Keep retired and specialized audio/image/realtime models out of the selector.
REVIEW_MODELS = (
    'gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-luna', 'gpt-6-sol',
    'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna',
    'gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano',
    'gpt-5.2', 'gpt-5.1', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
    'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini',
)


def default_model() -> str:
    return os.getenv('REVIEW_MODEL', '').strip() or 'gpt-4.1-mini'


def review_models() -> list[str]:
    return list(dict.fromkeys([*REVIEW_MODELS, default_model()]))


def resolve_model(model: str | None = None) -> str:
    selected = (model or '').strip() or default_model()
    if selected not in review_models():
        raise ValueError('Unsupported review model. Choose a model from the selector.')
    return selected


def model_options(model: str | None = None) -> dict:
    selected = resolve_model(model)
    options = {'model': selected, 'timeout': 120, 'max_retries': 2}
    # Reasoning models reject temperature with their default reasoning settings.
    if selected.startswith(('gpt-5', 'gpt-6')):
        options['temperature'] = None
    else:
        options['temperature'] = 0
    return options
