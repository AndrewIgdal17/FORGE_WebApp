# FORGE Web App

Web application for the [FORGE](https://github.com/AndrewIgdal17/FORGE) (Framework for Open Reproducible Grid Economics) calculator.

## Quick Start

```bash
# macOS — double-click or:
./run_server.command

# Manual:
uv sync
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Open http://127.0.0.1:8000 in your browser.

## Architecture

- **Backend:** FastAPI server (`app/`) that wraps the FORGE calculator
- **Frontend:** Static HTML/JS/CSS (`static/`) with taxonomy-driven input forms
- **Calculator:** Installed as a pip dependency from the public FORGE repo
- **Data:** YAML templates bundled with the calculator; JSON cache generated on startup

## Dependencies

The FORGE calculator is installed automatically via:
```
pip install forge-calc @ git+https://github.com/AndrewIgdal17/FORGE.git
```

To update to the latest calculator:
```bash
pip install --upgrade forge-calc @ git+https://github.com/AndrewIgdal17/FORGE.git
```
