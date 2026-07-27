import os
import pytest
import subprocess
import json

def is_live_llm_configured():
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key:
        # Check .env file if available
        env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
        if os.path.isfile(env_file):
            with open(env_file, "r") as f:
                for line in f:
                    if line.startswith("OPENROUTER_API_KEY="):
                        api_key = line.strip().split("=", 1)[1]
    return bool(api_key and not api_key.startswith("sk-or-v1-your-api-key"))

@pytest.mark.skipif(not is_live_llm_configured(), reason="Live OpenRouter API key not configured in environment or .env")
def test_live_openrouter_llm_call():
    """Validates live response generation, streaming, and cost tracking via OpenRouter backend."""
    node_script = """
    import { AdventureEngine } from './engine/index.js';
    const engine = new AdventureEngine();
    (async () => {
      await engine.newAdventure('Live Integration Test');
      const chunks = [];
      let costEvent = null;
      for await (const event of engine.generateResponseStream('action', 'open mailbox')) {
        if (event.type === 'chunk') chunks.push(event.content);
        else if (event.type === 'cost') costEvent = event;
      }
      const output = chunks.join('');
      console.log('[LIVE_RESULT]' + JSON.stringify({ output, costEvent, model: engine.model }));
    })();
    """

    env = os.environ.copy()
    env["MOCK_LLM"] = "0"
    env["LLM_BACKEND"] = "openrouter"

    result = subprocess.run(
        ["node", "-e", node_script],
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        capture_output=True,
        text=True,
        env=env,
        timeout=30
    )

    json_lines = [line[13:] for line in result.stdout.strip().splitlines() if line.startswith("[LIVE_RESULT]")]
    assert len(json_lines) > 0, f"No [LIVE_RESULT] output from node script. Full stdout: {result.stdout}"
    data = json.loads(json_lines[-1])
    assert len(data["output"]) > 0, "Live LLM response should not be empty"
    assert "model" in data and "deepseek" in data["model"].lower(), f"Unexpected model: {data['model']}"
    assert data["costEvent"] is not None, "Live LLM call should record token cost tracking"
