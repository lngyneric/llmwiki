#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

echo "======================================"
echo "🚀 Installing LLM Wiki CLI..."
echo "======================================"

# 1. Install dependencies
echo "📦 Installing npm dependencies..."
npm install

# 2. Build the TypeScript code
echo "🔨 Building the project..."
npm run build

# 3. Link the package globally so 'llm-wiki' command is available
echo "🔗 Linking the CLI globally..."
npm link

echo "======================================"
echo "✅ Installation complete!"
echo "You can now use the 'llm-wiki' command."
echo "======================================"

# 4. Verify installation
echo "📌 Installed version:"
llm-wiki -V
