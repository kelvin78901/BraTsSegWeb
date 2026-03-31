#!/usr/bin/env bash
# ================================================================
#  SmartMed BraTS — Linux CPU-only Deployment (ONNX)
# ================================================================
# Tested on: Ubuntu 22.04 / Debian 12 / Rocky 9  (x86-64)
# Prerequisites: root or sudo access, internet
# ================================================================

set -euo pipefail

APP_DIR="/opt/smartmed"
SIDECAR_DIR="$APP_DIR/sidecar"
SPRING_DIR="$APP_DIR/spring/demo"
ONNX_MODEL="$SIDECAR_DIR/models/monai_brats/model.onnx"

echo "╔══════════════════════════════════════════════════════╗"
echo "║  SmartMed · Linux CPU Deployment (ONNX)             ║"
echo "╚══════════════════════════════════════════════════════╝"

# ── 1. System packages ──────────────────────────────────────
echo "[1/6] Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq \
    openjdk-17-jre-headless \
    python3 python3-pip python3-venv \
    maven \
    nginx \
    curl \
    unzip

# ── 2. Deploy application code ──────────────────────────────
echo "[2/6] Deploying application code..."
sudo mkdir -p "$APP_DIR"
# Copy your project to $APP_DIR (replace with your actual method)
# e.g.: sudo cp -r /path/to/brats_web/* "$APP_DIR/"
echo "  → Copy project files to $APP_DIR"

# ── 3. Python virtual environment (CPU only) ────────────────
echo "[3/6] Setting up Python venv..."
python3 -m venv "$SIDECAR_DIR/venv"
source "$SIDECAR_DIR/venv/bin/activate"
pip install --upgrade pip
pip install -r "$SIDECAR_DIR/requirements-cpu.txt"
deactivate

echo "  → Python packages installed (no torch, no CUDA)"

# ── 4. ONNX model ───────────────────────────────────────────
echo "[4/6] Checking ONNX model..."
if [ ! -f "$ONNX_MODEL" ]; then
    echo "  ⚠  model.onnx not found at $ONNX_MODEL"
    echo "  You must export it on a dev machine first:"
    echo ""
    echo "    cd sidecar"
    echo "    pip install torch monai"
    echo "    python export_onnx.py \\"
    echo "        --model-path models/monai_brats/model.pt \\"
    echo "        --output     models/monai_brats/model.onnx \\"
    echo "        --model-url  https://huggingface.co/MONAI/brats_mri_segmentation/resolve/main/models/model.pt"
    echo ""
    echo "  Then scp model.onnx to $ONNX_MODEL"
else
    echo "  → ONNX model found ($(du -h "$ONNX_MODEL" | cut -f1))"
fi

# ── 5. Build Spring Boot JAR ────────────────────────────────
echo "[5/6] Building Spring Boot..."
cd "$SPRING_DIR"
mvn -q package -DskipTests
echo "  → JAR built: $(ls target/*.jar 2>/dev/null | head -1)"

# ── 6. Systemd services ─────────────────────────────────────
echo "[6/6] Installing systemd services..."

# Sidecar service
sudo tee /etc/systemd/system/smartmed-sidecar.service > /dev/null <<SVCEOF
[Unit]
Description=SmartMed Sidecar (FastAPI + ONNX)
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$SIDECAR_DIR
Environment=SEG_BACKEND=onnx
Environment=ONNX_MODEL_PATH=$ONNX_MODEL
Environment=CASES_DIR=$APP_DIR/spring/demo/src/main/resources/static/viewer/cases
Environment=MAX_UPLOAD_BYTES=536870912
ExecStart=$SIDECAR_DIR/venv/bin/uvicorn app:app --host 127.0.0.1 --port 5000 --workers 1 --timeout-keep-alive 600
Restart=on-failure
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
SVCEOF

# Spring Boot service
sudo tee /etc/systemd/system/smartmed-spring.service > /dev/null <<SVCEOF
[Unit]
Description=SmartMed Spring Boot
After=network.target smartmed-sidecar.service

[Service]
Type=simple
User=www-data
WorkingDirectory=$SPRING_DIR
Environment=JAVA_OPTS=-Xmx512m
ExecStart=/usr/bin/java -Xmx512m -jar target/med-demo-0.0.1-SNAPSHOT.jar --server.port=8080
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

sudo systemctl daemon-reload
sudo systemctl enable smartmed-sidecar smartmed-spring
sudo systemctl start  smartmed-sidecar
sleep 3
sudo systemctl start  smartmed-spring

echo ""
echo "═══════════════════════════════════════════════"
echo "  ✔ Sidecar: http://127.0.0.1:5000/health"
echo "  ✔ Spring:  http://127.0.0.1:8080"
echo "═══════════════════════════════════════════════"
echo ""
echo "Next: configure Nginx reverse proxy (see below)"
