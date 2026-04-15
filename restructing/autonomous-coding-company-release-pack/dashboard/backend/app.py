from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
import yaml

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECTS_DIR = BASE_DIR.parent / '.ai' / 'projects'

app = FastAPI(title='Autonomous Coding Dashboard')
app.mount('/static', StaticFiles(directory=str(BASE_DIR / 'frontend' / 'static')), name='static')
templates = Jinja2Templates(directory=str(BASE_DIR / 'frontend' / 'templates'))

def list_projects():
    items = []
    if PROJECTS_DIR.exists():
        for p in PROJECTS_DIR.iterdir():
            if p.is_dir() and p.name != 'TEMPLATE':
                items.append({'key': p.name})
    return items

@app.get('/', response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse('index.html', {'request': request, 'projects': list_projects()})
