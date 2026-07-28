import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['mcp/server.js']
});

const client = new Client({ name: 'sample-session-tester', version: '1.0.0' });

async function runSampleSession() {
  await client.connect(transport);

  console.log('--- 1. Initialize Session ---');
  const initRes = await client.callTool({ name: 'dungeon_init_session', arguments: { title: 'Sample Playtest' } });
  console.log(initRes.content[0].text);

  console.log('\n--- 2. Inspect State ---');
  const stateRes = await client.callTool({ name: 'dungeon_inspect_state', arguments: {} });
  console.log(stateRes.content[0].text);

  console.log('\n--- 3. Send Action ("look around") ---');
  const action1Res = await client.callTool({ name: 'dungeon_send_action', arguments: { action_type: 'do', text: 'look around' } });
  console.log(action1Res.content[0].text);

  console.log('\n--- 4. Send Action ("open mailbox") ---');
  const action2Res = await client.callTool({ name: 'dungeon_send_action', arguments: { action_type: 'do', text: 'open mailbox' } });
  console.log(action2Res.content[0].text);

  console.log('\n--- 5. Inspect State After Actions ---');
  const state2Res = await client.callTool({ name: 'dungeon_inspect_state', arguments: {} });
  console.log(state2Res.content[0].text);

  console.log('\n--- 6. Undo Action ---');
  const undoRes = await client.callTool({ name: 'dungeon_undo_action', arguments: {} });
  console.log(undoRes.content[0].text);

  console.log('\n--- 7. Inspect History ---');
  const historyRes = await client.callTool({ name: 'dungeon_inspect_history', arguments: {} });
  console.log(historyRes.content[0].text);

  await client.close();
  console.log('\n=== Sample MCP Session Test Completed Successfully! ===');
}

runSampleSession().catch(err => {
  console.error('Error executing sample session:', err);
  process.exit(1);
});
