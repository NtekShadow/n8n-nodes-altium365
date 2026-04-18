#!/bin/bash

set -e  # Exit on error

echo "🔍 Finding n8n Docker container..."

# Find n8n container ID
CONTAINER_ID=$(docker ps --filter "ancestor=n8nio/n8n" --format "{{.ID}}" | head -n 1)

if [ -z "$CONTAINER_ID" ]; then
    # Try alternative search by name
    CONTAINER_ID=$(docker ps --filter "name=n8n" --format "{{.ID}}" | head -n 1)
fi

if [ -z "$CONTAINER_ID" ]; then
    echo "❌ Error: Could not find running n8n Docker container"
    echo "💡 Make sure n8n is running with: docker ps"
    exit 1
fi

CONTAINER_NAME=$(docker ps --filter "id=$CONTAINER_ID" --format "{{.Names}}")
echo "✅ Found n8n container: $CONTAINER_NAME ($CONTAINER_ID)"

echo ""
echo "📦 Checking current version..."

# Get current version
CURRENT_VERSION=$(docker exec "$CONTAINER_ID" sh -c "cd /home/node/.n8n/nodes && npm list @ntek/n8n-nodes-altium365 --depth=0 2>/dev/null | grep @ntek/n8n-nodes-altium365 | cut -d@ -f3" || echo "unknown")
echo "📌 Current version: $CURRENT_VERSION"

echo ""
echo "🧹 Clearing npm cache..."
docker exec "$CONTAINER_ID" sh -c "npm cache clean --force" > /dev/null 2>&1

echo "🔍 Updating @ntek/n8n-nodes-altium365..."

# Capture npm update output - use install with @latest to force fresh fetch
UPDATE_OUTPUT=$(docker exec "$CONTAINER_ID" sh -c "cd /home/node/.n8n/nodes && npm install @ntek/n8n-nodes-altium365@latest --force 2>&1")
UPDATE_EXIT_CODE=$?

if [ $UPDATE_EXIT_CODE -ne 0 ]; then
    echo "❌ Error: Failed to update npm package"
    echo "$UPDATE_OUTPUT"
    exit 1
fi

# Get new version
NEW_VERSION=$(docker exec "$CONTAINER_ID" sh -c "cd /home/node/.n8n/nodes && npm list @ntek/n8n-nodes-altium365 --depth=0 2>/dev/null | grep @ntek/n8n-nodes-altium365 | cut -d@ -f3" || echo "unknown")

echo "📌 New version: $NEW_VERSION"

# Check if version changed
if [ "$CURRENT_VERSION" = "$NEW_VERSION" ]; then
    echo ""
    echo "ℹ️  No update available - already on version $CURRENT_VERSION"
    echo ""
    echo "💡 If you just published a new version, npm registry may need a few minutes to sync"
    echo "   Try again in 1-2 minutes, or check: https://www.npmjs.com/package/@ntek/n8n-nodes-altium365"
    echo ""
    echo "⏭️  Skipping container restart (no changes detected)"
    exit 0
fi

echo "✅ Package updated: $CURRENT_VERSION → $NEW_VERSION"

echo ""
echo "🔄 Restarting n8n container..."

# Restart the container
docker restart "$CONTAINER_ID" > /dev/null

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to restart container"
    exit 1
fi

echo "✅ Container restarted successfully"

echo ""
echo "⏳ Waiting for n8n to be ready..."
sleep 5

echo ""
echo "🎉 Done! Updated to version $NEW_VERSION"
echo "📝 n8n should be ready at your usual URL"
