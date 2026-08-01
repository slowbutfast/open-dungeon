import os
import pytest
import subprocess
import json

pytestmark = pytest.mark.integration

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
    env["OPENROUTER_MODEL"] = "deepseek/deepseek-v4-pro"

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

@pytest.mark.skipif(not is_live_llm_configured(), reason="Live OpenRouter API key not configured in environment or .env")
def test_live_reasoning_model_status_line_and_thinking():
    """Validates that live reasoning models (DeepSeek-R1 / V4 Pro) process system prompts without confusion,
    emit reasoning traces ([DeepSeek Thinking]), and output valid status lines with synchronized Moves counters."""
    node_script = """
    import { AdventureEngine } from './engine/index.js';
    import { getDebugLogs } from './engine/llmTracker.js';

    const engine = new AdventureEngine();
    (async () => {
      await engine.newAdventure('Reasoning Test');
      const initialMoves = engine.moves;
      const chunks = [];
      for await (const event of engine.generateResponseStream('action', 'look around')) {
        if (event.type === 'chunk') chunks.push(event.content);
      }
      const output = chunks.join('');
      const logs = getDebugLogs();
      const thinkingLogs = logs.filter(l => l.message && l.message.includes('[DeepSeek Thinking]'));
      console.log('[REASONING_RESULT]' + JSON.stringify({
        output,
        initialMoves,
        movesAfterTurn: engine.moves,
        location: engine.location,
        score: engine.score,
        thinkingCount: thinkingLogs.length,
        thinkingSnippet: thinkingLogs.length > 0 ? thinkingLogs[0].message.substring(0, 300) : ''
      }));
    })();
    """

    env = os.environ.copy()
    env["MOCK_LLM"] = "0"
    env["LLM_BACKEND"] = "openrouter"
    env["OPENROUTER_MODEL"] = "deepseek/deepseek-v4-pro"

    result = subprocess.run(
        ["node", "-e", node_script],
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        capture_output=True,
        text=True,
        env=env,
        timeout=30
    )

    json_lines = [line[18:] for line in result.stdout.strip().splitlines() if line.startswith("[REASONING_RESULT]")]
    assert len(json_lines) > 0, f"No [REASONING_RESULT] output from node script. Full stdout: {result.stdout}"
    data = json.loads(json_lines[-1])

    assert data["initialMoves"] == 0, f"Initial moves should be 0, got {data['initialMoves']}"
    assert data["movesAfterTurn"] is not None and data["movesAfterTurn"] >= 0, f"Moves after turn should be tracked as a valid number, got {data['movesAfterTurn']}"
    assert len(data["location"]) > 0, "Location should be parsed from status line"
    assert data["thinkingCount"] > 0, "Reasoning model should produce thinking logs"
    assert "West of House" in data["thinkingSnippet"] or "narrator" in data["thinkingSnippet"].lower(), "Reasoning trace should reflect clear system prompt comprehension"
