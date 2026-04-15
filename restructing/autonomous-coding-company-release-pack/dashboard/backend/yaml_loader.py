from pathlib import Path
import yaml

def load_yaml(path: Path):
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text(encoding='utf-8')) or {}
