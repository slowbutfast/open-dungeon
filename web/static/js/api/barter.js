export async function fetchInventory() {
  const res = await fetch('/api/memory/inventory');
  if (!res.ok) throw new Error('Failed to fetch inventory');
  return res.json();
}

export async function fetchOffers(traderName) {
  const res = await fetch(`/api/trade/offers?trader=${encodeURIComponent(traderName)}`);
  if (!res.ok) throw new Error('Failed to fetch offers');
  return res.json();
}

export async function executeTrade(traderName, requiredItem) {
  const res = await fetch('/api/trade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trader_name: traderName, required_item: requiredItem })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'Trade failed' }));
    throw new Error(errData.error);
  }
  return res;
}

export async function fetchGoals() {
  const res = await fetch('/api/goals');
  if (!res.ok) throw new Error('Failed to fetch goals');
  return res.json();
}

export async function createGoal(npcName, goalTitle, requiredItem, rewardItem) {
  const res = await fetch('/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ npc_name: npcName, goal_title: goalTitle, required_item: requiredItem, reward_item: rewardItem })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'Failed to create goal' }));
    throw new Error(errData.error);
  }
  return res.json();
}

export async function completeGoal(goalId) {
  const res = await fetch('/api/goals/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal_id: goalId })
  });
  return res;
}

export async function acceptGoal(goalId) {
  const res = await fetch('/api/goals/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal_id: goalId })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'Failed to accept goal' }));
    throw new Error(errData.error);
  }
  return res.json();
}

export async function failGoal(goalId) {
  const res = await fetch('/api/goals/fail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal_id: goalId })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'Failed to fail goal' }));
    throw new Error(errData.error);
  }
  return res.json();
}
