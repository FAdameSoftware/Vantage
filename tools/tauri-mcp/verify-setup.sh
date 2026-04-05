#!/usr/bin/env bash
# Verify that the Tauri MCP server integration is properly set up.
# Run from the Vantage project root.

set -e

echo "=== Tauri MCP Server Setup Verification ==="
echo ""

# 1. Check Rust dependency
echo "[1/4] Checking Cargo.toml for tauri-plugin-mcp-bridge..."
if grep -q 'tauri-plugin-mcp-bridge' src-tauri/Cargo.toml; then
    echo "  OK: tauri-plugin-mcp-bridge found in Cargo.toml"
else
    echo "  FAIL: tauri-plugin-mcp-bridge not in Cargo.toml"
    echo "  Add: tauri-plugin-mcp-bridge = \"0.10\""
    exit 1
fi

# 2. Check Rust plugin registration
echo "[2/4] Checking lib.rs for plugin registration..."
if grep -q 'tauri_plugin_mcp_bridge' src-tauri/src/lib.rs; then
    echo "  OK: tauri_plugin_mcp_bridge::init() found in lib.rs"
else
    echo "  FAIL: Plugin not registered in lib.rs"
    exit 1
fi

# 3. Check .mcp.json
echo "[3/4] Checking .mcp.json for tauri-mcp server..."
if [ -f .mcp.json ]; then
    if grep -q 'tauri-mcp' .mcp.json; then
        echo "  OK: tauri-mcp server configured in .mcp.json"
    else
        echo "  WARN: .mcp.json exists but tauri-mcp not configured"
        echo "  Add this to .mcp.json mcpServers:"
        echo '    "tauri-mcp": {'
        echo '      "command": "cmd",'
        echo '      "args": ["/c", "npx", "-y", "@hypothesi/tauri-mcp-server@latest"],'
        echo '      "env": {}'
        echo '    }'
    fi
else
    echo "  FAIL: .mcp.json not found"
    exit 1
fi

# 4. Check npx availability
echo "[4/4] Checking if @hypothesi/tauri-mcp-server is accessible..."
if npx -y @hypothesi/tauri-mcp-server --help >/dev/null 2>&1; then
    echo "  OK: @hypothesi/tauri-mcp-server is accessible via npx"
else
    echo "  INFO: Package will be downloaded on first use (npx -y)"
fi

echo ""
echo "=== Verification Complete ==="
echo ""
echo "To test the full integration:"
echo "  1. Run: npm run tauri dev"
echo "  2. In another terminal, start Claude Code in this directory"
echo "  3. Ask Claude to take a screenshot of the app"
