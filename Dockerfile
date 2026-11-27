FROM python:3.12-slim

# 1. Install system dependencies and Node.js (including npm)
RUN apt-get update && \
    # Install basic tools and CA certificates for HTTPS requests
    apt-get install -y gcc curl git ca-certificates && \
    # Fetch and run the NodeSource Node 20.x setup script
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    # Install Node.js and npm
    apt-get install -y nodejs && \
    # Clear APT caches to reduce image size
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install acpx globally
RUN npm install -g acpx@latest

WORKDIR /app

# 2. Copy dependency files first to use cached layers
COPY pyproject.toml uv.lock ./

# 3. Install Python dependencies
RUN pip install uv && \
    uv venv && \
    uv sync

# 4. Copy source after dependencies to avoid unnecessary reinstalls
COPY . .

# 5. Fetch the optional safety word list (disabled by default; intended for Steam releases)
ARG FETCH_SAFETY_WORDS=false
RUN if [ "$FETCH_SAFETY_WORDS" = "true" ]; then python scripts/fetch_safety_words.py; fi

# 6. Set directory permissions
RUN mkdir -p uploaded_files && \
    chmod 755 uploaded_files

EXPOSE 3456

# 6. Configure environment variables
# Use IS_DOCKER=1 instead of ELECTRON_NODE_EXEC to identify the container environment
ENV HOST=0.0.0.0 \
    PORT=3456 \
    PYTHONUNBUFFERED=1 \
    IS_DOCKER=1

CMD [".venv/bin/python", "server.py", "--host", "0.0.0.0", "--port", "3456"]