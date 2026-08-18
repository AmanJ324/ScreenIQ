#!/bin/bash
set -e

# Change directory to project root
cd "$(dirname "$0")"

echo "=== Starting AI-Powered Resume Screener Setup ==="

# Check virtual environment
if [ ! -d "backend/venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv backend/venv --without-pip
    
    echo "Downloading and bootstrapping pip..."
    curl -sSL https://bootstrap.pypa.io/get-pip.py -o backend/venv/get-pip.py
    backend/venv/bin/python3 backend/venv/get-pip.py
    rm backend/venv/get-pip.py
fi

echo "Installing requirements..."
backend/venv/bin/pip install -r backend/requirements.txt

echo "Pre-training the Logistic Regression classifier..."
PYTHONPATH=backend backend/venv/bin/python3 backend/app/ml.py

echo "=== Setup complete! ==="
echo "Starting the FastAPI server on http://localhost:8000"
PYTHONPATH=backend backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
