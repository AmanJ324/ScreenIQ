# Use lightweight python runtime as parent image
FROM python:3.11-slim as builder

# Set working directory
WORKDIR /app

# Install build dependencies (needed for any source packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Final stage
FROM python:3.11-slim

WORKDIR /app

# Copy installed libraries from builder stage
COPY --from=builder /root/.local /root/.local
COPY backend/app /app/app

# Ensure local bin is in PATH
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONPATH=/app

# Expose port 8000
EXPOSE 8000

# Run FastAPI app with Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
