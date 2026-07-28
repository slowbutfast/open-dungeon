import fs from 'fs';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const STATE_FILE = '/home/node/global-sandbox/projects/open-dungeon/tests/active_playtest.json';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['mcp/server.js']
});

const client = new Client({ name: 'autoplay-runner', version: '1.0.0' });

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'state';

  await client.connect(transport);

  let savedState = {};
  if (fs.existsSync(STATE_FILE)) {
    try {
      savedState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (e) {}
  }

  if (command === 'init') {
    const title = args[1] || 'Autoplay Session';
    const initRes = await client.callTool({ name: 'dungeon_init_session', arguments: { title } });
    const initData = JSON.parse(initRes.content[0].text);
    fs.writeFileSync(STATE_FILE, JSON.stringify(initData, null, 2));
    console.log(JSON.stringify({ step: 'init', output: initData }, null, 2));
  } else if (command === 'action') {
    const text = args.slice(1).join(' ');
    if (savedState.adventure_id) {
      await client.callTool({ name: 'dungeon_load_save', arguments: { adventure_id: savedState.adventure_id } });
    }
    const actionRes = await client.callTool({ name: 'dungeon_send_action', arguments: { action_type: 'do', text } });
    const actionData = JSON.parse(actionRes.content[0].text);

    const stateRes = await client.callTool({ name: 'dungeon_inspect_state', arguments: {} });
    const currentState = JSON.parse(stateRes.content[0].text);
    fs.writeFileSync(STATE_FILE, JSON.stringify(currentState, null, 2));

    console.log(JSON.stringify({ step: 'action', action: text, result: actionData, state: currentState }, null, 2));
  } else if (command === 'inspect') {
    if (savedState.adventure_id) {
      await client.callTool({ name: 'dungeon_load_save', arguments: { adventure_id: savedState.adventure_id } });
    }
    const stateRes = await client.callTool({ name: 'dungeon_inspect_state', arguments: {} });
    const invRes = await client.callTool({ name: 'dungeon_inspect_inventory', arguments: {} });
    const goalsRes = await client.callTool({ name: 'dungeon_inspect_goals', arguments: {} });
    const historyRes = await client.callTool({ name: 'dungeon_inspect_history', arguments: {} });
    const debugRes = await client.callTool({ name: 'dungeon_get_debug_info', arguments: {} });

    console.log(JSON.stringify({
      state: JSON.parse(stateRes.content[0].text),
      inventory: JSON.parse(invRes.content[0].text),
      goals: JSON.parse(goalsRes.content[0].text),
      history: JSON.parse(historyRes.content[0].text),
      debug: JSON.parse(debugRes.content[0].text)
    }, null, 2));
  }

  await client.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
